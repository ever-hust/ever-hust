import { NextResponse } from "next/server";

/**
 * Simple in-memory sliding window rate limiter for API routes.
 *
 * Limits:
 * - Authenticated routes: 100 requests per minute (keyed by userId)
 * - Public routes: 20 requests per minute (keyed by IP)
 *
 * In production, swap this for Redis/Upstash for distributed rate limiting.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key.
 * Uses a sliding window algorithm.
 */
export function checkApiRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  cleanup(windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0]!;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + windowMs,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetAt: now + windowMs,
  };
}

/** Rate limits per PRD section 13. */
export const API_RATE_LIMITS = {
  /** Authenticated user routes: 100 req/min */
  authenticated: { limit: 100, windowMs: 60_000 },
  /** Public/unauthenticated routes: 20 req/min */
  public: { limit: 20, windowMs: 60_000 },
  /** AI chat route: stricter limit of 30 req/min */
  chat: { limit: 30, windowMs: 60_000 },
} as const;

/**
 * Helper to apply rate limiting in API routes.
 * Returns a 429 Response if the limit is exceeded, or null if the request is allowed.
 *
 * @example
 * ```ts
 * const limited = applyRateLimit(userId, "authenticated");
 * if (limited) return limited;
 * ```
 */
export function applyRateLimit(
  key: string,
  tier: keyof typeof API_RATE_LIMITS
): NextResponse | null {
  const config = API_RATE_LIMITS[tier];
  const result = checkApiRateLimit(
    `${tier}:${key}`,
    config.limit,
    config.windowMs
  );

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: "Too many requests. Please try again later.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      }
    );
  }

  return null;
}
