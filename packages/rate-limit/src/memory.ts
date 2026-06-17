import type {
  RateLimiter,
  RateLimitOptions,
  RateLimitPeek,
  RateLimitResult,
} from "./types";

/**
 * In-memory fixed-window rate limiter — the **default** driver.
 *
 * Per-process: counters live in this module's `Map`, so in a multi-pod
 * deployment each pod tracks its own counts (a user effectively gets `N × limit`
 * across `N` pods). That's fine for local dev / single-pod, and is the historical
 * behaviour. For distributed enforcement, switch to the Redis driver — see
 * {@link file://../README.md}.
 *
 * Semantics are a faithful port of the original `subscription-gate.ts` counter:
 * a new/expired window starts at 1; `consume` blocks once `count >= limit`.
 */
export class MemoryRateLimiter implements RateLimiter {
  readonly driver = "memory" as const;

  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  /** Max entries before triggering cleanup to bound memory growth. */
  private static readonly MAX_ENTRIES = 10_000;

  private cleanupExpired(now: number): void {
    for (const [key, entry] of this.counters) {
      if (now > entry.resetAt) this.counters.delete(key);
    }
  }

  consume(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
    const now = Date.now();

    if (this.counters.size > MemoryRateLimiter.MAX_ENTRIES) {
      this.cleanupExpired(now);
    }

    const entry = this.counters.get(key);

    if (!entry || now > entry.resetAt) {
      this.counters.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: limit - entry.count };
  }

  peek(key: string, { limit }: RateLimitOptions): RateLimitPeek {
    const now = Date.now();
    const entry = this.counters.get(key);

    if (!entry || now > entry.resetAt) {
      return { used: 0, remaining: limit, limit };
    }

    return {
      used: entry.count,
      remaining: Math.max(0, limit - entry.count),
      limit,
    };
  }
}
