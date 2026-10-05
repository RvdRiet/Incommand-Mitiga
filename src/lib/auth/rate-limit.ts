import { getRedis } from "@/lib/redis";

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE). Fail-open: if Redis
 * is unavailable we allow the request but log — availability matters for an
 * emergency-ops tool, and account lockout (DB-backed) is the second layer.
 */
export type RateResult = { allowed: boolean; remaining: number; retryAfterSec: number };

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateResult> {
  const redis = getRedis();
  if (!redis) return { allowed: true, remaining: limit, retryAfterSec: 0 };

  const redisKey = `rl:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSec);
    const ttl = count === 1 ? windowSec : await redis.ttl(redisKey);
    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSec: allowed ? 0 : Math.max(1, ttl),
    };
  } catch (e) {
    console.warn("[rate-limit] redis failure, allowing:", (e as Error).message);
    return { allowed: true, remaining: limit, retryAfterSec: 0 };
  }
}

/** Clear a counter (e.g. on a successful login). */
export async function resetRateLimit(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`rl:${key}`);
  } catch {
    /* best-effort */
  }
}

// Tuned defaults for the login endpoint.
export const LOGIN_LIMITS = {
  perAccount: { limit: 5, windowSec: 15 * 60 }, // 5 tries / 15 min per email+tenant
  perIp: { limit: 30, windowSec: 15 * 60 }, // 30 tries / 15 min per IP
};

// DB-backed account lockout thresholds (see users.failed_login_count/locked_until).
export const LOCKOUT = { threshold: 5, durationMs: 15 * 60 * 1000 };
