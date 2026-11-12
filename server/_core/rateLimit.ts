import type { Request, RequestHandler } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Lightweight per-process rate limiter for endpoints that do filesystem,
 * signing or expensive AI work. It intentionally avoids trusting arbitrary
 * forwarding headers; Express' req.ip follows the app's configured proxy policy.
 */
export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  let requestsSinceCleanup = 0;

  return (req, res, next) => {
    const now = Date.now();
    const key = options.key?.(req) ?? req.ip ?? req.socket?.remoteAddress ?? "unknown";

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 500 || buckets.size > 10_000) {
      requestsSinceCleanup = 0;
      buckets.forEach((bucket, bucketKey) => {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      });
    }

    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: "Muitas requisições. Tente novamente em instantes." });
      return;
    }

    current.count += 1;
    next();
  };
}
