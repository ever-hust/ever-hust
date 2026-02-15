import { FREE_LIMITS } from "@repo/stripe";

/**
 * Simple in-memory rate counter for free tier limits.
 * In production, this would use Redis/Upstash for distributed counting.
 *
 * This mirrors the counter logic in apps/web/lib/subscription-gate.ts
 * but lives in the AI package so tool-level rate limiting can be enforced
 * without a circular dependency on the Next.js app.
 */
const counters = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

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
