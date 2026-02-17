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
  userId: string
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

/**
 * Simple in-memory rate counter for free tier limits.
 * In production, this would use Redis/Upstash for distributed counting.
 */
const counters = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = counters.get(key);

  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
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
  const entry = counters.get(key);

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
export function checkMessageLimit(userId: string): {
  allowed: boolean;
  remaining: number;
} {
  return checkRateLimit(
    `msg:${userId}`,
    FREE_LIMITS.messagesPerDay,
    ONE_DAY_MS
  );
}

/**
 * Check if a free user has exceeded their daily search limit.
 */
export function checkSearchLimit(userId: string): {
  allowed: boolean;
  remaining: number;
} {
  return checkRateLimit(
    `search:${userId}`,
    FREE_LIMITS.searchesPerDay,
    ONE_DAY_MS
  );
}

/**
 * Check if a free user has exceeded their weekly cover letter limit.
 */
export function checkCoverLetterLimit(userId: string): {
  allowed: boolean;
  remaining: number;
} {
  return checkRateLimit(
    `cover:${userId}`,
    FREE_LIMITS.coverLettersPerWeek,
    ONE_WEEK_MS
  );
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
