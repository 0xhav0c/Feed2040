import { getRedis } from "@/lib/redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

// In-memory fixed-window fallback. Used when Redis is absent or erroring so
// rate limiting keeps working (important for auth/brute-force protection)
// instead of silently failing open. Effective per-process only, which matches
// the single-container deployment.
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function checkMemory(
  key: string,
  maxRequests: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();

  // Opportunistically prune expired buckets to bound memory growth.
  if (memoryBuckets.size > 5000) {
    for (const [k, b] of memoryBuckets) {
      if (now >= b.resetAt) memoryBuckets.delete(k);
    }
  }

  const bucket = memoryBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  bucket.count++;
  if (bucket.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: Math.max(0, maxRequests - bucket.count) };
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedis();

  if (!redis) {
    return checkMemory(key, maxRequests, windowSeconds);
  }

  try {
    const redisKey = `ratelimit:${key}`;
    // INCR and EXPIRE in one round trip; NX keeps the window fixed. If the
    // separate EXPIRE ever failed the key would never expire and the limiter
    // (including login) would stay locked for good.
    const results = await redis.multi().incr(redisKey).expire(redisKey, windowSeconds, "NX").exec();
    const current = Number(results?.[0]?.[1] ?? 0);

    const remaining = Math.max(0, maxRequests - current);

    if (current > maxRequests) {
      const ttl = await redis.ttl(redisKey);
      return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }

    return { allowed: true, remaining };
  } catch {
    // Redis errored — fall back to the in-memory limiter rather than fail open.
    return checkMemory(key, maxRequests, windowSeconds);
  }
}

export function rateLimitHeaders(result: RateLimitResult, maxRequests: number): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(maxRequests),
    "X-RateLimit-Remaining": String(result.remaining),
  };
  if (result.retryAfter) {
    headers["Retry-After"] = String(result.retryAfter);
  }
  return headers;
}
