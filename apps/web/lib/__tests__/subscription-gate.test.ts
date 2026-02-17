/**
 * Unit tests for subscription-gate.ts rate limiting utilities.
 *
 * Tests the in-memory rate limiter (checkMemoryRateLimit) and
 * the public API functions (checkMessageLimit, checkSearchLimit, etc.).
 */

// We need to test the module's internal state, so we isolate each test
// by dynamically importing to get fresh module state.

describe("subscription-gate rate limiting", () => {
  // Reset module between tests to clear in-memory counters
  let mod: typeof import("../subscription-gate");

  beforeEach(async () => {
    // Clear the module cache so each test starts with fresh counters
    jest.resetModules();
    mod = await import("../subscription-gate");
  });

  describe("peekRateLimit", () => {
    it("returns full remaining when no usage exists", () => {
      const result = mod.peekRateLimit("test:user1", 5, 86400000);
      expect(result).toEqual({ used: 0, remaining: 5, limit: 5 });
    });

    it("does not increment counters (read-only)", () => {
      // Peek twice — should return same result
      const first = mod.peekRateLimit("test:user1", 10, 86400000);
      const second = mod.peekRateLimit("test:user1", 10, 86400000);
      expect(first).toEqual(second);
      expect(first.used).toBe(0);
    });
  });

  describe("checkMessageLimit", () => {
    it("allows requests within the limit", async () => {
      const result = await mod.checkMessageLimit("user-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it("tracks usage across multiple calls", async () => {
      const first = await mod.checkMessageLimit("user-2");
      const second = await mod.checkMessageLimit("user-2");

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(true);
      // Remaining should decrease
      expect(second.remaining).toBeLessThan(first.remaining);
    });

    it("isolates users from each other", async () => {
      await mod.checkMessageLimit("user-a");
      await mod.checkMessageLimit("user-a");
      const userB = await mod.checkMessageLimit("user-b");

      // user-b should have full remaining (minus 1 for this call)
      expect(userB.allowed).toBe(true);
    });
  });

  describe("checkSearchLimit", () => {
    it("allows searches within the daily limit", async () => {
      const result = await mod.checkSearchLimit("user-search-1");
      expect(result.allowed).toBe(true);
    });

    it("blocks after exceeding the limit", async () => {
      // Exhaust the search limit (FREE_LIMITS.searchesPerDay is typically 5)
      const results = [];
      for (let i = 0; i < 20; i++) {
        results.push(await mod.checkSearchLimit("user-exhaust"));
      }

      // At some point it should block
      const blocked = results.find((r) => !r.allowed);
      expect(blocked).toBeDefined();
      expect(blocked!.remaining).toBe(0);
    });
  });

  describe("checkCoverLetterLimit", () => {
    it("allows cover letter generation within weekly limit", async () => {
      const result = await mod.checkCoverLetterLimit("user-cover-1");
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkSubscription", () => {
    // This function requires a database connection, so we can't fully test it
    // in unit tests. We just verify the function signature exists.
    it("is exported as an async function", () => {
      expect(typeof mod.checkSubscription).toBe("function");
    });
  });

  describe("peek usage functions", () => {
    it("peekMessageUsage returns usage stats", () => {
      const stats = mod.peekMessageUsage("peek-user-1");
      expect(stats).toHaveProperty("used");
      expect(stats).toHaveProperty("remaining");
      expect(stats).toHaveProperty("limit");
    });

    it("peekSearchUsage returns usage stats", () => {
      const stats = mod.peekSearchUsage("peek-user-2");
      expect(stats).toHaveProperty("used");
      expect(stats).toHaveProperty("remaining");
      expect(stats).toHaveProperty("limit");
    });

    it("peekCoverLetterUsage returns usage stats", () => {
      const stats = mod.peekCoverLetterUsage("peek-user-3");
      expect(stats).toHaveProperty("used");
      expect(stats).toHaveProperty("remaining");
      expect(stats).toHaveProperty("limit");
    });

    it("reflects usage after checkMessageLimit calls", async () => {
      await mod.checkMessageLimit("reflect-user");
      await mod.checkMessageLimit("reflect-user");

      const stats = mod.peekMessageUsage("reflect-user");
      expect(stats.used).toBe(2);
    });
  });
});
