import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { FREE_LIMITS } from "@repo/stripe";

// ---------------------------------------------------------------------------
// Upstash Redis rate limiter for distributed, production-safe counting.
// Falls back to in-memory sliding-window when UPSTASH_REDIS_REST_URL is not set
// (local dev / CI).
// ---------------------------------------------------------------------------

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// ---------------------------------------------------------------------------
// In-memory fallback (same behaviour as before, used when Redis unavailable)
// ---------------------------------------------------------------------------
const memoryCounters = new Map<string, { count: number; resetAt: number }>();

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = memoryCounters.get(key);

  if (!entry || now > entry.resetAt) {
    memoryCounters.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

// ---------------------------------------------------------------------------
// Upstash rate limit helpers — sliding window per feature
// ---------------------------------------------------------------------------

/** Cache Ratelimit instances so we don't recreate on every call. */
const limiters = new Map<string, Ratelimit>();

function getUpstashLimiter(prefix: string, limit: number, windowSec: number, redisClient: Redis): Ratelimit {
  const cacheKey = `${prefix}:${limit}:${windowSec}`;
  const cached = limiters.get(cacheKey);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    prefix: `everjobs:rl:${prefix}`,
    analytics: true,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

// ---------------------------------------------------------------------------
// Unified check — uses Redis when available, memory otherwise.
// ---------------------------------------------------------------------------
async function checkRateLimit(
  prefix: string,
  userId: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const r = getRedis();
  if (!r) {
    // Fallback: in-memory for local dev
    return checkMemoryRateLimit(`${prefix}:${userId}`, limit, windowMs);
  }

  const windowSec = Math.ceil(windowMs / 1000);
  const limiter = getUpstashLimiter(prefix, limit, windowSec, r);

  const { success, remaining } = await limiter.limit(userId);
  return { allowed: success, remaining };
}

// ---------------------------------------------------------------------------
// Window durations
// ---------------------------------------------------------------------------
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

// ---------------------------------------------------------------------------
// Public API (async now — callers already await or can be updated)
// ---------------------------------------------------------------------------

/**
 * Check if a free user has exceeded their daily search limit.
 */
export function checkSearchLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  return checkRateLimit("search", userId, FREE_LIMITS.searchesPerDay, ONE_DAY_MS);
}

/**
 * Check if a free user has exceeded their weekly cover letter limit.
 */
export function checkCoverLetterLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  return checkRateLimit("cover", userId, FREE_LIMITS.coverLettersPerWeek, ONE_WEEK_MS);
}
