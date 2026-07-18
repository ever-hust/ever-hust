import {
  resolveDriver,
  createRateLimiterFromEnv,
  getRateLimiter,
  resetRateLimiter,
} from "./factory";
import { MemoryRateLimiter } from "./memory";
import { RedisRateLimiter } from "./redis";

describe("rate-limit factory", () => {
  afterEach(() => resetRateLimiter());

  describe("resolveDriver", () => {
    it("defaults to memory with no env", () => {
      expect(resolveDriver({})).toBe("memory");
    });
    it("uses redis when a URL is present", () => {
      expect(resolveDriver({ RATE_LIMIT_REDIS_URL: "rediss://x" })).toBe("redis");
    });
    it("honors explicit RATE_LIMIT_DRIVER over URL presence", () => {
      expect(
        resolveDriver({ RATE_LIMIT_DRIVER: "memory", RATE_LIMIT_REDIS_URL: "rediss://x" }),
      ).toBe("memory");
      expect(resolveDriver({ RATE_LIMIT_DRIVER: "redis" })).toBe("redis");
    });
  });

  describe("createRateLimiterFromEnv", () => {
    it("returns an in-memory limiter by default", () => {
      expect(createRateLimiterFromEnv({})).toBeInstanceOf(MemoryRateLimiter);
    });
    it("returns a Redis limiter when configured (without connecting)", () => {
      const rl = createRateLimiterFromEnv({ RATE_LIMIT_REDIS_URL: "rediss://localhost:6379" });
      expect(rl).toBeInstanceOf(RedisRateLimiter);
      expect(rl.driver).toBe("redis");
    });
    it("fails safe to memory when driver=redis but the URL is missing", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      expect(createRateLimiterFromEnv({ RATE_LIMIT_DRIVER: "redis" })).toBeInstanceOf(
        MemoryRateLimiter,
      );
      warn.mockRestore();
    });
  });

  describe("getRateLimiter", () => {
    it("returns a stable singleton until reset", () => {
      const a = getRateLimiter();
      expect(getRateLimiter()).toBe(a);
      resetRateLimiter();
      expect(getRateLimiter()).not.toBe(a);
    });
  });
});
