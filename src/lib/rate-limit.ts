import { getRedis } from "@/lib/redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedis();

  if (!redis) {
    return { allowed: true, remaining: maxRequests };
  }

  try {
    const redisKey = `ratelimit:${key}`;
    const current = await redis.incr(redisKey);

    if (current === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - current);

    if (current > maxRequests) {
      const ttl = await redis.ttl(redisKey);
      return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }

    return { allowed: true, remaining };
  } catch {
    return { allowed: true, remaining: maxRequests };
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
