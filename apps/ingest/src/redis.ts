import Redis from "ioredis";

let client: Redis | null = null;

/** Returns a singleton Redis client connected to REDIS_ADDR. */
export function getRedisClient(): Redis {
  if (!client) {
    const addr = process.env.REDIS_ADDR ?? "redis:6379";
    const [host, portStr] = addr.split(":");
    client = new Redis({
      host,
      port: parseInt(portStr ?? "6379", 10),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    client.on("error", (err: Error) => {
      console.error("redis error:", err.message);
    });
  }
  return client;
}

/** Publishes an event payload to Redis Streams key `threats:stream`. */
export async function publishToStream(
  payload: Record<string, unknown>
): Promise<string> {
  const redis = getRedisClient();
  const id = await redis.xadd(
    "threats:stream",
    "*",
    "payload",
    JSON.stringify(payload)
  );
  if (!id) throw new Error("redis xadd returned null id");
  return id;
}
