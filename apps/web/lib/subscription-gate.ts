import { db, users } from "@repo/db";
import { FREE_LIMITS } from "@repo/stripe";
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
// In-memory rate limiting — simple sliding-window counter.
// In production with multiple instances, consider using Redis (Upstash).
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

/**
 * Check rate limit — uses in-memory sliding window.
 */
async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  return checkMemoryRateLimit(key, limit, windowMs);
}

/**
 * Read-only version of checkRateLimit — peeks at current usage without incrementing.
 */
export function peekRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { used: number; remaining: number; limit: number } {
  const now = Date.now();
  const entry = memoryCounters.get(key);

  if (!entry || now > entry.resetAt) {
    return { used: 0, remaining: limit, limit };
  }

  return {
    used: entry.count,
    remaining: Math.max(0, limit - entry.count),
    limit,
  };
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

// -- Read-only peek functions for usage stats endpoint --

export function peekMessageUsage(userId: string) {
  return peekRateLimit(`msg:${userId}`, FREE_LIMITS.messagesPerDay, ONE_DAY_MS);
}

export function peekSearchUsage(userId: string) {
  return peekRateLimit(`search:${userId}`, FREE_LIMITS.searchesPerDay, ONE_DAY_MS);
}

export function peekCoverLetterUsage(userId: string) {
  return peekRateLimit(`cover:${userId}`, FREE_LIMITS.coverLettersPerWeek, ONE_WEEK_MS);
}
