import type {
  RateLimiter,
  RateLimitOptions,
  RateLimitPeek,
  RateLimitRedisClient,
  RateLimitResult,
} from "./types";

/**
 * Distributed fixed-window rate limiter backed by Redis.
 *
 * **Disabled by default** — only constructed by the factory when
 * `RATE_LIMIT_REDIS_URL` is set. Uses an atomic `INCR` + `PEXPIRE` Lua script so
 * the window matches the in-memory driver's semantics exactly (fixed window,
 * blocks once the count exceeds `limit`), but shared across all pods.
 *
 * Provider-agnostic: works with any TCP Redis (DigitalOcean Managed Redis,
 * self-hosted, Valkey, …) via `ioredis`. See {@link file://../README.md} for the
 * one-time enable steps.
 */

/** Atomic fixed-window increment. Returns the post-increment counter value. */
const FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

const GET_SCRIPT = `return redis.call('GET', KEYS[1])`;

/**
 * Lazily import `ioredis`. It is an **optional** dependency: not installed until
 * Redis is actually enabled. The non-literal specifier + bundler-ignore comments
 * keep `tsc` and Next's bundler from trying to resolve it at build time.
 */
async function loadIoRedisCtor(): Promise<
  new (connectionString: string) => RateLimitRedisClient
> {
  const moduleName = "ioredis";
  try {
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleName)) as {
      default: new (connectionString: string) => RateLimitRedisClient;
    };
    return mod.default;
  } catch {
    throw new Error(
      "[@ever-hust/rate-limit] Redis driver requested but the 'ioredis' package is not installed. " +
        "Install it where the limiter runs (e.g. `pnpm --filter web add ioredis`) and set " +
        "RATE_LIMIT_REDIS_URL. See packages/rate-limit/README.md.",
    );
  }
}

export interface RedisRateLimiterOptions {
  /** Redis connection string, e.g. `rediss://default:pass@host:25061/0`. */
  url: string;
  /** Key namespace; defaults to `everhust:rl:`. */
  prefix?: string;
  /**
   * Optional pre-built client (mainly for tests). When provided, `url` is unused
   * and `ioredis` is never imported.
   */
  client?: RateLimitRedisClient;
}

export class RedisRateLimiter implements RateLimiter {
  readonly driver = "redis" as const;

  private readonly url: string;
  private readonly prefix: string;
  private clientPromise: Promise<RateLimitRedisClient> | null = null;

  constructor(options: RedisRateLimiterOptions) {
    this.url = options.url;
    this.prefix = options.prefix ?? "everhust:rl:";
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    }
  }

  /** Connect lazily on first use so constructing the limiter never opens a socket. */
  private client(): Promise<RateLimitRedisClient> {
    if (!this.clientPromise) {
      this.clientPromise = loadIoRedisCtor().then((Ctor) => new Ctor(this.url));
    }
    return this.clientPromise;
  }

  private prefixed(key: string): string {
    return `${this.prefix}${key}`;
  }

  async consume(
    key: string,
    { limit, windowMs }: RateLimitOptions,
  ): Promise<RateLimitResult> {
    const client = await this.client();
    const raw = await client.eval(
      FIXED_WINDOW_SCRIPT,
      1,
      this.prefixed(key),
      windowMs,
    );
    const current = Number(raw);
    if (!Number.isFinite(current) || current > limit) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: Math.max(0, limit - current) };
  }

  async peek(
    key: string,
    { limit }: RateLimitOptions,
  ): Promise<RateLimitPeek> {
    const client = await this.client();
    const raw = await client.eval(GET_SCRIPT, 1, this.prefixed(key));
    const used = raw == null ? 0 : Number(raw);
    const safeUsed = Number.isFinite(used) ? used : 0;
    return { used: safeUsed, remaining: Math.max(0, limit - safeUsed), limit };
  }
}
