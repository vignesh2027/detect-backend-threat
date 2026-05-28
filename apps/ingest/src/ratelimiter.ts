interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * TokenBucketLimiter implements a per-key token bucket with configurable capacity and refill rate.
 * In-memory — no external dependencies — designed for high-throughput ingest paths.
 */
export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillRatePerMs: number;

  constructor(capacity: number, refillPerSecond: number) {
    this.capacity = capacity;
    this.refillRatePerMs = refillPerSecond / 1000;
  }

  /** Returns true if the request is allowed (one token consumed), false if rate-limited. */
  allow(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsed * this.refillRatePerMs
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Removes buckets that have been idle longer than maxAgeMs to prevent memory growth. */
  prune(maxAgeMs = 60_000): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAgeMs) {
        this.buckets.delete(key);
      }
    }
  }
}
