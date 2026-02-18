/**
 * Comprehensive tests for subscription-gate.ts —
 * in-memory rate limiting, subscription checking, and peek functions.
 */

describe("subscription-gate rate limiting", () => {
  // Reset module between tests to clear in-memory counters
  let mod: typeof import("../subscription-gate");

  beforeEach(async () => {
    jest.resetModules();
    mod = await import("../subscription-gate");
  });

  // ── peekRateLimit ─────────────────────────────────────────────────────

  describe("peekRateLimit", () => {
    it("returns full remaining when no usage exists", () => {
      const result = mod.peekRateLimit("test:unused", 5, 86_400_000);
      expect(result).toEqual({ used: 0, remaining: 5, limit: 5 });
    });

    it("does not increment counters (read-only)", () => {
      const first = mod.peekRateLimit("test:peek-only", 10, 86_400_000);
      const second = mod.peekRateLimit("test:peek-only", 10, 86_400_000);
      expect(first).toEqual(second);
      expect(first.used).toBe(0);
    });

    it("reflects actual usage after rate limit checks", async () => {
      // Use 3 messages
      await mod.checkMessageLimit("peek-reflect-user");
      await mod.checkMessageLimit("peek-reflect-user");
      await mod.checkMessageLimit("peek-reflect-user");

      const stats = mod.peekMessageUsage("peek-reflect-user");
      expect(stats.used).toBe(3);
      expect(stats.remaining).toBe(7);
      expect(stats.limit).toBe(10);
    });
  });

  // ── checkMessageLimit (10/day) ────────────────────────────────────────

  describe("checkMessageLimit", () => {
    it("allows first message for a new user", async () => {
      const result = await mod.checkMessageLimit("msg-new");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("decrements remaining on each call", async () => {
      const r1 = await mod.checkMessageLimit("msg-decrement");
      const r2 = await mod.checkMessageLimit("msg-decrement");
      const r3 = await mod.checkMessageLimit("msg-decrement");

      expect(r1.remaining).toBe(9);
      expect(r2.remaining).toBe(8);
      expect(r3.remaining).toBe(7);
    });

    it("blocks after 10 messages are sent", async () => {
      for (let i = 0; i < 10; i++) {
        const r = await mod.checkMessageLimit("msg-exhaust");
        expect(r.allowed).toBe(true);
      }

      const blocked = await mod.checkMessageLimit("msg-exhaust");
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it("keeps blocking on subsequent calls after limit", async () => {
      for (let i = 0; i < 10; i++) {
        await mod.checkMessageLimit("msg-keep-blocked");
      }

      // Multiple calls after limit should all be blocked
      const r1 = await mod.checkMessageLimit("msg-keep-blocked");
      const r2 = await mod.checkMessageLimit("msg-keep-blocked");
      expect(r1.allowed).toBe(false);
      expect(r2.allowed).toBe(false);
    });

    it("isolates different users", async () => {
      // User A uses 5 messages
      for (let i = 0; i < 5; i++) {
        await mod.checkMessageLimit("msg-user-a");
      }

      // User B should still have full quota
      const userB = await mod.checkMessageLimit("msg-user-b");
      expect(userB.allowed).toBe(true);
      expect(userB.remaining).toBe(9);
    });
  });

  // ── Peek usage functions ──────────────────────────────────────────────

  describe("peek usage functions", () => {
    it("peekMessageUsage returns zero for unused user", () => {
      const stats = mod.peekMessageUsage("unused-peek-1");
      expect(stats).toEqual({ used: 0, remaining: 10, limit: 10 });
    });

    it("peekSearchUsage returns zero for unused user", () => {
      const stats = mod.peekSearchUsage("unused-peek-2");
      expect(stats).toEqual({ used: 0, remaining: 5, limit: 5 });
    });

    it("peekCoverLetterUsage returns zero for unused user", () => {
      const stats = mod.peekCoverLetterUsage("unused-peek-3");
      expect(stats).toEqual({ used: 0, remaining: 1, limit: 1 });
    });

    it("peekMessageUsage does not increment counter", async () => {
      await mod.checkMessageLimit("peek-no-inc");
      const p1 = mod.peekMessageUsage("peek-no-inc");
      const p2 = mod.peekMessageUsage("peek-no-inc");
      expect(p1.used).toBe(1);
      expect(p2.used).toBe(1); // unchanged
    });

    it("peekSearchUsage returns zero for unused user (search limits handled by AI package)", () => {
      const stats = mod.peekSearchUsage("peek-search");
      expect(stats.used).toBe(0);
      expect(stats.remaining).toBe(5);
    });

    it("peekCoverLetterUsage returns zero for unused user (cover letter limits handled by AI package)", () => {
      const stats = mod.peekCoverLetterUsage("peek-cover");
      expect(stats.used).toBe(0);
      expect(stats.remaining).toBe(1);
    });
  });

  // ── checkSubscription ─────────────────────────────────────────────────

  describe("checkSubscription", () => {
    it("is exported as an async function", () => {
      expect(typeof mod.checkSubscription).toBe("function");
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("peek and check use consistent state", async () => {
      const userId = "consistent-state";
      await mod.checkMessageLimit(userId);
      await mod.checkMessageLimit(userId);

      const peekStats = mod.peekMessageUsage(userId);
      const checkResult = await mod.checkMessageLimit(userId);

      // After peek (2 used), check should decrement to 3 used
      expect(peekStats.used).toBe(2);
      expect(checkResult.remaining).toBe(7); // 10 - 3
    });
  });
});
