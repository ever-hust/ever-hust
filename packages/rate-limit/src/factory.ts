import { MemoryRateLimiter } from "./memory";
import { RedisRateLimiter } from "./redis";
import type { RateLimiter } from "./types";

/**
 * Driver selection + shared limiter singleton.
 *
 * **Default is in-memory.** Redis is opt-in and stays off until you set
 * `RATE_LIMIT_REDIS_URL` (and, ideally, install `ioredis`). See
 * {@link file://../README.md} for the enable steps.
 *
 * Env vars:
 *  - `RATE_LIMIT_REDIS_URL` — Redis connection string. Presence flips the default
 *    driver to Redis.
 *  - `RATE_LIMIT_DRIVER` — `"memory"` | `"redis"` to force a driver explicitly.
 *  - `RATE_LIMIT_PREFIX` — optional Redis key namespace.
 */

type Env = Record<string, string | undefined>;

let _shared: RateLimiter | null = null;

/** Resolve the configured driver from env (without constructing anything). */
export function resolveDriver(env: Env = process.env): "memory" | "redis" {
  const explicit = env.RATE_LIMIT_DRIVER?.trim().toLowerCase();
  if (explicit === "memory") return "memory";
  if (explicit === "redis") return "redis";
  return env.RATE_LIMIT_REDIS_URL?.trim() ? "redis" : "memory";
}

/**
 * Build a limiter from env. Defaults to in-memory; only returns a Redis limiter
 * when a URL is configured. If `RATE_LIMIT_DRIVER=redis` but no URL is set, fails
 * safe to in-memory rather than throwing.
 */
export function createRateLimiterFromEnv(env: Env = process.env): RateLimiter {
  if (resolveDriver(env) === "redis") {
    const url = env.RATE_LIMIT_REDIS_URL?.trim();
    if (url) {
      const prefix = env.RATE_LIMIT_PREFIX?.trim();
      return new RedisRateLimiter({ url, prefix: prefix || undefined });
    }
    console.warn(
      "[@ever-hust/rate-limit] RATE_LIMIT_DRIVER=redis but RATE_LIMIT_REDIS_URL is unset; falling back to in-memory.",
    );
  }
  return new MemoryRateLimiter();
}

/**
 * Process-wide shared limiter (lazy singleton). Most callers want this so all
 * limits share one backend.
 */
export function getRateLimiter(): RateLimiter {
  if (!_shared) _shared = createRateLimiterFromEnv();
  return _shared;
}

/** Clear the shared singleton — for tests and hot-reload only. */
export function resetRateLimiter(): void {
  _shared = null;
}
