import { RedisRateLimiter } from "./redis";
import type { RateLimitRedisClient } from "./types";

function fakeClient(evalImpl: RateLimitRedisClient["eval"]): RateLimitRedisClient {
  return { eval: evalImpl };
}

describe("RedisRateLimiter", () => {
  it("allows while the counter <= limit and reports remaining", async () => {
    let count = 0;
    const rl = new RedisRateLimiter({ url: "x", client: fakeClient(async () => ++count) });
    expect(await rl.consume("k", { limit: 3, windowMs: 1000 })).toEqual({ allowed: true, remaining: 2 });
    expect(await rl.consume("k", { limit: 3, windowMs: 1000 })).toEqual({ allowed: true, remaining: 1 });
    expect(await rl.consume("k", { limit: 3, windowMs: 1000 })).toEqual({ allowed: true, remaining: 0 });
  });

  it("blocks once the counter exceeds the limit", async () => {
    const rl = new RedisRateLimiter({ url: "x", client: fakeClient(async () => 4) });
    expect(await rl.consume("k", { limit: 3, windowMs: 1000 })).toEqual({ allowed: false, remaining: 0 });
  });

  it("matches the memory driver: limit N → N allowed, (N+1)th blocked", async () => {
    let count = 0;
    const rl = new RedisRateLimiter({ url: "x", client: fakeClient(async () => ++count) });
    const limit = 10;
    for (let i = 0; i < limit; i++) {
      expect((await rl.consume("k", { limit, windowMs: 1000 })).allowed).toBe(true);
    }
    expect((await rl.consume("k", { limit, windowMs: 1000 })).allowed).toBe(false);
  });

  it("prefixes the key and passes the window (ms) to the script", async () => {
    const calls: Array<Array<string | number>> = [];
    const rl = new RedisRateLimiter({
      url: "x",
      prefix: "p:",
      client: fakeClient(async (_script, _numKeys, ...args) => {
        calls.push(args);
        return 1;
      }),
    });
    await rl.consume("k", { limit: 5, windowMs: 1234 });
    expect(calls[0]).toEqual(["p:k", 1234]);
  });

  it("peek reads the counter without incrementing", async () => {
    const rl = new RedisRateLimiter({
      url: "x",
      client: fakeClient(async (script) => (script.includes("GET") ? 2 : 99)),
    });
    expect(await rl.peek("k", { limit: 5, windowMs: 1000 })).toEqual({ used: 2, remaining: 3, limit: 5 });
  });

  it("peek treats a missing key as zero usage", async () => {
    const rl = new RedisRateLimiter({ url: "x", client: fakeClient(async () => null) });
    expect(await rl.peek("k", { limit: 5, windowMs: 1000 })).toEqual({ used: 0, remaining: 5, limit: 5 });
  });

  it("exposes driver 'redis'", () => {
    expect(new RedisRateLimiter({ url: "x", client: fakeClient(async () => 1) }).driver).toBe("redis");
  });
});
