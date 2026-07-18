/**
 * Shared types for the rate-limit abstraction.
 *
 * The limiter is a **fixed-window counter**: each `consume` records one event and
 * reports whether it fell within `limit` events per `windowMs`. This matches the
 * historical in-memory behaviour used for the free-tier daily message / search /
 * cover-letter caps (a user may burst up to 2× across a window boundary).
 */

export interface RateLimitOptions {
  /** Maximum number of events permitted within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether this event is within the limit. */
  allowed: boolean;
  /** Events remaining in the current window after this call (never negative). */
  remaining: number;
}

export interface RateLimitPeek {
  /** Events already recorded in the current window. */
  used: number;
  /** Events remaining in the current window (never negative). */
  remaining: number;
  /** The configured limit (echoed for convenience). */
  limit: number;
}

/**
 * A fixed-window rate limiter.
 *
 * Implementations may be synchronous (in-memory) or asynchronous (Redis), so the
 * return types are unions — callers should `await` to stay driver-agnostic.
 */
export interface RateLimiter {
  /** Which backend this limiter uses. */
  readonly driver: "memory" | "redis";

  /** Record one event for `key` and report whether it was allowed. */
  consume(
    key: string,
    options: RateLimitOptions,
  ): RateLimitResult | Promise<RateLimitResult>;

  /**
   * Read current usage for `key` without recording an event.
   *
   * Fully supported by the in-memory driver (synchronous). The Redis driver
   * resolves asynchronously; consumers needing a *synchronous* peek (e.g. a
   * usage-stats endpoint) should read from the in-memory driver.
   */
  peek(
    key: string,
    options: RateLimitOptions,
  ): RateLimitPeek | Promise<RateLimitPeek>;
}

/**
 * Minimal Redis client surface the {@link RateLimiter} needs — just `eval` (for
 * the atomic fixed-window Lua script). `ioredis` satisfies this shape, as does
 * any compatible TCP Redis client (DigitalOcean Managed Redis, self-hosted, …).
 */
export interface RateLimitRedisClient {
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
}
