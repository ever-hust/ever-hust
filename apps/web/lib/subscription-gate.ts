import { db, users } from "@ever-hust/db";
import { FREE_LIMITS } from "@ever-hust/stripe";
import { getRateLimiter, MemoryRateLimiter, type RateLimiter } from "@ever-hust/rate-limit";
import { eq } from "drizzle-orm";
import { ONE_DAY_MS, ONE_WEEK_MS } from "./constants";

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
    // User row not found (ghost session or deleted account) — fail closed
    // rather than silently granting free-tier access.
    throw new Error(`User not found: ${userId}`);
  }

  const status = result[0]!.subscriptionStatus;
  const isActive = status === "active" || status === "past_due";
  return {
    userId,
    isActive,
    limits: isActive ? null : FREE_LIMITS,
  };
}

// ---------------------------------------------------------------------------
// Rate limiting — delegates to @ever-hust/rate-limit (fixed-window counter).
//
// Default driver is **in-memory** (per-pod), preserving the historical
// behaviour: a user can burst up to 2× the limit across a window boundary, and
// counts are not shared across pods. To make the daily caps distributed, set
// `RATE_LIMIT_REDIS_URL` (DigitalOcean Redis, self-hosted, …) — see
// packages/rate-limit/README.md. The limiter switches with no code change.
// ---------------------------------------------------------------------------

/** Shared limiter for the free-tier message cap. In-memory unless Redis is configured. */
const limiter: RateLimiter = getRateLimiter();

/**
 * In-memory limiter used by the synchronous `peek*` helpers (the usage-stats
 * endpoint). When the shared limiter is in-memory — the default — this IS the
 * same instance, so peeks and checks stay consistent. Under the Redis driver,
 * these peeks reflect only this pod's local view (the stats endpoint is
 * non-critical; the authoritative count lives in Redis).
 */
const peekLimiter: MemoryRateLimiter =
  limiter instanceof MemoryRateLimiter ? limiter : new MemoryRateLimiter();

/**
 * Read-only peek at a counter's current usage without incrementing it.
 */
export function peekRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { used: number; remaining: number; limit: number } {
  return peekLimiter.peek(key, { limit, windowMs });
}

/**
 * Check if a free user has exceeded their daily message limit.
 */
export async function checkMessageLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  return limiter.consume(`msg:${userId}`, {
    limit: FREE_LIMITS.messagesPerDay,
    windowMs: ONE_DAY_MS,
  });
}

// -- Read-only peek functions for usage stats endpoint --

export function peekMessageUsage(userId: string): { used: number; remaining: number; limit: number } {
  return peekRateLimit(`msg:${userId}`, FREE_LIMITS.messagesPerDay, ONE_DAY_MS);
}

export function peekSearchUsage(userId: string): { used: number; remaining: number; limit: number } {
  return peekRateLimit(`search:${userId}`, FREE_LIMITS.searchesPerDay, ONE_DAY_MS);
}

export function peekCoverLetterUsage(userId: string): { used: number; remaining: number; limit: number } {
  return peekRateLimit(`cover:${userId}`, FREE_LIMITS.coverLettersPerWeek, ONE_WEEK_MS);
}
