// WebSocket API route: subscribes to Redis Streams and fans out to dashboard clients.
// Uses Next.js 14 App Router route handlers with Node.js WebSocket server.
import { type NextRequest } from "next/server";
import { WebSocketServer, type WebSocket } from "ws";
import Redis from "ioredis";

// Module-level singletons (survive HMR in dev, stable in prod)
let wss:   WebSocketServer | null = null;
let redis: Redis | null = null;
let streamReader: ReturnType<typeof startStreamReader> | null = null;

const STREAM_KEY   = "threats:stream";
const HEARTBEAT_MS = 30_000;

function getRedis(): Redis {
  if (!redis) {
    const addr = process.env.REDIS_ADDR ?? "localhost:6379";
    const [host, portStr] = addr.split(":");
    redis = new Redis({
      host:                host ?? "localhost",
      port:                parseInt(portStr ?? "6379", 10),
      maxRetriesPerRequest: null, // required for blocking commands
      enableReadyCheck:    false,
      lazyConnect:         false,
    });
  }
  return redis;
}

function getWSS(): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
  }
  return wss;
}

/** Broadcast a message to all connected dashboard clients. */
function broadcast(data: string) {
  getWSS().clients.forEach((client) => {
    if (client.readyState === 1 /* OPEN */) client.send(data);
  });
}

/** Subscribe to Redis XREAD BLOCK 0 and fan-out to dashboard clients. */
async function startStreamReader(): Promise<void> {
  const r        = getRedis();
  let   lastId   = "$"; // only new messages from now on

  while (true) {
    try {
      // XREAD BLOCK 5000 COUNT 50 STREAMS threats:stream lastId
      const result = await r.xread(
        "BLOCK", 5000,
        "COUNT", 50,
        "STREAMS", STREAM_KEY, lastId
      ) as [string, [string, string[]][]][] | null;

      if (!result) continue;

      for (const [, entries] of result) {
        for (const [id, fields] of entries) {
          lastId = id;
          // fields is flat [key, val, key, val, ...]
          const payloadIdx = fields.indexOf("payload");
          if (payloadIdx !== -1) {
            const raw = fields[payloadIdx + 1];
            if (raw) broadcast(raw);
          }
        }
      }
    } catch (err) {
      console.error("ws/route: stream reader error:", err);
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}

// Start the stream reader exactly once
if (!streamReader) {
  streamReader = startStreamReader();
}

// Heartbeat to detect stale connections
function startHeartbeat(ws: WebSocket) {
  let alive = true;
  ws.on("pong", () => { alive = true; });
  const timer = setInterval(() => {
    if (!alive) { ws.terminate(); clearInterval(timer); return; }
    alive = false;
    ws.ping();
  }, HEARTBEAT_MS);
  ws.on("close", () => clearInterval(timer));
}

/** Next.js 14 App Router GET handler — upgrades HTTP → WebSocket. */
export function GET(req: NextRequest) {
  // @ts-expect-error — Next.js exposes raw Node.js socket on request
  const socket: import("net").Socket = req.socket;
  if (!socket) {
    return new Response("WebSocket upgrade requires Node.js runtime", { status: 400 });
  }

  const server = getWSS();

  server.handleUpgrade(
    // @ts-expect-error — partial IncomingMessage constructed from NextRequest
    req,
    socket,
    Buffer.alloc(0),
    (ws) => {
      server.emit("connection", ws, req);
      startHeartbeat(ws);
      ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));
    }
  );

  // Return undefined — response is handled by the WS upgrade
  return new Response(null, { status: 101 });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
