import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { EventPayloadSchema } from "./schema";
import { publishToStream } from "./redis";
import { TokenBucketLimiter } from "./ratelimiter";

const limiter = new TokenBucketLimiter(1000, 500);

// Prune stale rate-limit buckets every 60s.
setInterval(() => limiter.prune(), 60_000).unref();

/** Attaches a WebSocket server to an existing HTTP server at path /ws/events. */
export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws/events" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const ip = req.socket.remoteAddress ?? "unknown";
    console.log(`ws: client connected from ${ip}`);

    ws.on("message", async (data) => {
      if (!limiter.allow(ip)) {
        ws.send(JSON.stringify({ error: "rate_limited" }));
        return;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ error: "invalid_json" }));
        return;
      }

      const parsed = EventPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        ws.send(
          JSON.stringify({ error: "validation_failed", issues: parsed.error.issues })
        );
        return;
      }

      try {
        const streamId = await publishToStream(parsed.data);
        ws.send(JSON.stringify({ ok: true, stream_id: streamId }));
      } catch (err) {
        console.error("ws: redis publish error:", err);
        ws.send(JSON.stringify({ error: "internal_error" }));
      }
    });

    ws.on("close", () => console.log(`ws: client ${ip} disconnected`));
    ws.on("error", (err: Error) =>
      console.error(`ws: client ${ip} error:`, err.message)
    );
  });

  return wss;
}
