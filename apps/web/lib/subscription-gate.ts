import { db, users } from "@repo/db";
import { FREE_LIMITS } from "@repo/stripe";
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
// In-memory rate limiting — fixed-window counter.
// Note: this is a fixed-window algorithm, not a true sliding window.
// A user can burst up to 2× the limit across a window boundary.
// For stricter enforcement, use the Redis-backed sliding-window in
// lib/rate-limit.ts or Upstash.
// In production with multiple instances, consider using Redis (Upstash).
// ---------------------------------------------------------------------------

const memoryCounters = new Map<string, { count: number; resetAt: number }>();

/** Max entries before triggering cleanup to prevent unbounded memory growth. */
const MAX_COUNTER_ENTRIES = 10_000;

/**
 * Remove expired entries from the in-memory rate limit map.
 * Called automatically when the map exceeds MAX_COUNTER_ENTRIES.
 */
function cleanupExpiredCounters(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCounters) {
    if (now > entry.resetAt) {
      memoryCounters.delete(key);
    }
  }
}

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();

  // Prevent unbounded memory growth
  if (memoryCounters.size > MAX_COUNTER_ENTRIES) {
    cleanupExpiredCounters();
  }

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
 * Check rate limit — uses in-memory fixed-window counter.
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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


/**
 * Check if a free user has exceeded their daily message limit.
 */
export function checkMessageLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  return checkRateLimit(`msg:${userId}`, FREE_LIMITS.messagesPerDay, ONE_DAY_MS);
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
