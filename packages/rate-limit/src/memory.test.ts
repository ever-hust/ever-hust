import { MemoryRateLimiter } from "./memory";

const DAY = 24 * 60 * 60 * 1000;

describe("MemoryRateLimiter", () => {
  it("allows the first event and decrements remaining", () => {
    const rl = new MemoryRateLimiter();
    expect(rl.consume("k", { limit: 10, windowMs: DAY })).toEqual({ allowed: true, remaining: 9 });
    expect(rl.consume("k", { limit: 10, windowMs: DAY })).toEqual({ allowed: true, remaining: 8 });
  });

  it("blocks after the limit is reached (fixed window): N allowed, (N+1)th blocked", () => {
    const rl = new MemoryRateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(rl.consume("k", { limit: 10, windowMs: DAY }).allowed).toBe(true);
    }
    expect(rl.consume("k", { limit: 10, windowMs: DAY })).toEqual({ allowed: false, remaining: 0 });
  });

  it("isolates different keys", () => {
    const rl = new MemoryRateLimiter();
    rl.consume("a", { limit: 2, windowMs: DAY });
    expect(rl.consume("b", { limit: 2, windowMs: DAY })).toEqual({ allowed: true, remaining: 1 });
  });

  it("resets after the window elapses", () => {
    jest.useFakeTimers();
    try {
      const rl = new MemoryRateLimiter();
      rl.consume("k", { limit: 1, windowMs: 1000 });
      expect(rl.consume("k", { limit: 1, windowMs: 1000 }).allowed).toBe(false);
      jest.advanceTimersByTime(1001);
      expect(rl.consume("k", { limit: 1, windowMs: 1000 })).toEqual({ allowed: true, remaining: 0 });
    } finally {
      jest.useRealTimers();
    }
  });

  it("peek reports usage without consuming", () => {
    const rl = new MemoryRateLimiter();
    expect(rl.peek("k", { limit: 5, windowMs: DAY })).toEqual({ used: 0, remaining: 5, limit: 5 });
    rl.consume("k", { limit: 5, windowMs: DAY });
    rl.consume("k", { limit: 5, windowMs: DAY });
    expect(rl.peek("k", { limit: 5, windowMs: DAY })).toEqual({ used: 2, remaining: 3, limit: 5 });
    // peeking again does not change state
    expect(rl.peek("k", { limit: 5, windowMs: DAY })).toEqual({ used: 2, remaining: 3, limit: 5 });
  });

  it("exposes driver 'memory'", () => {
    expect(new MemoryRateLimiter().driver).toBe("memory");
  });
});
