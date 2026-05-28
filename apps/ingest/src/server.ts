import express, { Request, Response, NextFunction } from "express";
import { EventPayloadSchema } from "./schema";
import { publishToStream } from "./redis";
import { TokenBucketLimiter } from "./ratelimiter";

const limiter = new TokenBucketLimiter(5000, 1000);

export function createApp(): express.Application {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  app.post(
    "/events",
    async (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip ?? "unknown";

      if (!limiter.allow(ip)) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }

      const parsed = EventPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "validation_failed", issues: parsed.error.issues });
        return;
      }

      try {
        const streamId = await publishToStream(parsed.data);
        res.status(202).json({ ok: true, stream_id: streamId });
      } catch (err) {
        next(err);
      }
    }
  );

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("unhandled error:", err.message);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
