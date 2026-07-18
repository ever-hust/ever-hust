/**
 * @ever-hust/rate-limit — a small, driver-agnostic fixed-window rate limiter.
 *
 * - Default driver: **in-memory** (per-process) — identical to the historical
 *   free-tier counter behaviour. Safe for local dev and single-pod deploys.
 * - Optional driver: **Redis** (TCP, e.g. DigitalOcean Managed Redis) for
 *   distributed enforcement across pods. Off by default; enable via env. See the
 *   package README for the one-time steps.
 *
 * @example
 * ```ts
 * import { getRateLimiter } from "@ever-hust/rate-limit";
 * const limiter = getRateLimiter();
 * const { allowed, remaining } = await limiter.consume(`msg:${userId}`, {
 *   limit: 10,
 *   windowMs: 24 * 60 * 60 * 1000,
 * });
 * ```
 */

export type {
  RateLimiter,
  RateLimitOptions,
  RateLimitResult,
  RateLimitPeek,
  RateLimitRedisClient,
} from "./types";

export { MemoryRateLimiter } from "./memory";
export { RedisRateLimiter, type RedisRateLimiterOptions } from "./redis";
export {
  getRateLimiter,
  resetRateLimiter,
  createRateLimiterFromEnv,
  resolveDriver,
} from "./factory";
