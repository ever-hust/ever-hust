import { db, users } from "@repo/db";
import { FREE_LIMITS } from "@repo/stripe";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { eq } from "drizzle-orm";

export interface SubscriptionGate {
  userId: string;
  isActive: boolean;
  limits: typeof FREE_LIMITS | null;
}

/**
 * Check user subscription status and return their limits.
 * Active subscribers get null limits (unlimited).
 * Free users get FREE_LIMITS.
 */
export async function checkSubscription(
  userId: string,
): Promise<SubscriptionGate> {
  const result = await db
    .select({ subscriptionStatus: users.subscriptionStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (result.length === 0) {
    return { userId, isActive: false, limits: FREE_LIMITS };
  }

  const isActive = result[0]!.subscriptionStatus === "active";
  return {
    userId,
    isActive,
    limits: isActive ? null : FREE_LIMITS,
  };
}

// ---------------------------------------------------------------------------
// Upstash Redis rate limiting — production-safe distributed counter.
// Falls back to in-memory Map when UPSTASH_REDIS_REST_URL is unset (local dev).
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

// In-memory fallback for local development
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

// Cache Ratelimit instances
const limiters = new Map<string, Ratelimit>();

function getUpstashLimiter(prefix: string, limit: number, windowSec: number): Ratelimit {
  const cacheKey = `${prefix}:${limit}:${windowSec}`;
  const cached = limiters.get(cacheKey);
  if (cached) return cached;

  const r = getRedis()!;
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    prefix: `everjobs:rl:${prefix}`,
    analytics: true,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const r = getRedis();
  if (!r) {
    return checkMemoryRateLimit(key, limit, windowMs);
  }

  const windowSec = Math.ceil(windowMs / 1000);
  // Extract prefix and userId from key (format: "prefix:userId")
  const colonIdx = key.indexOf(":");
  const prefix = colonIdx > 0 ? key.slice(0, colonIdx) : "default";
  const userId = colonIdx > 0 ? key.slice(colonIdx + 1) : key;

  const limiter = getUpstashLimiter(prefix, limit, windowSec);
  const { success, remaining } = await limiter.limit(userId);
  return { allowed: success, remaining };
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/**
 * Check if a free user has exceeded their daily message limit.
 */
export function checkMessageLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  return checkRateLimit(`msg:${userId}`, FREE_LIMITS.messagesPerDay, ONE_DAY_MS);
}

/**
 * Check if a free user has exceeded their daily search limit.
 */
export function checkSearchLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  return checkRateLimit(`search:${userId}`, FREE_LIMITS.searchesPerDay, ONE_DAY_MS);
}

/**
 * Check if a free user has exceeded their weekly cover letter limit.
 */
export function checkCoverLetterLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  return checkRateLimit(`cover:${userId}`, FREE_LIMITS.coverLettersPerWeek, ONE_WEEK_MS);
}
