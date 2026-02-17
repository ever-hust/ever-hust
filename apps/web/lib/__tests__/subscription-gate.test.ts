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

  // ── checkSearchLimit (5/day) ──────────────────────────────────────────

  describe("checkSearchLimit", () => {
    it("allows first search", async () => {
      const result = await mod.checkSearchLimit("search-new");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("blocks after 5 searches", async () => {
      for (let i = 0; i < 5; i++) {
        const r = await mod.checkSearchLimit("search-exhaust");
        expect(r.allowed).toBe(true);
      }

      const blocked = await mod.checkSearchLimit("search-exhaust");
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  // ── checkCoverLetterLimit (1/week) ────────────────────────────────────

  describe("checkCoverLetterLimit", () => {
    it("allows first cover letter", async () => {
      const result = await mod.checkCoverLetterLimit("cover-new");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("blocks second cover letter in the same window", async () => {
      await mod.checkCoverLetterLimit("cover-block");
      const blocked = await mod.checkCoverLetterLimit("cover-block");
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
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

    it("peekSearchUsage reflects actual search usage", async () => {
      await mod.checkSearchLimit("peek-search");
      await mod.checkSearchLimit("peek-search");

      const stats = mod.peekSearchUsage("peek-search");
      expect(stats.used).toBe(2);
      expect(stats.remaining).toBe(3);
    });

    it("peekCoverLetterUsage reflects actual cover letter usage", async () => {
      await mod.checkCoverLetterLimit("peek-cover");

      const stats = mod.peekCoverLetterUsage("peek-cover");
      expect(stats.used).toBe(1);
      expect(stats.remaining).toBe(0);
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
    it("different limit types use separate counters", async () => {
      const userId = "multi-type";

      // Use all searches (5)
      for (let i = 0; i < 5; i++) {
        await mod.checkSearchLimit(userId);
      }

      // Messages should still be available
      const msgResult = await mod.checkMessageLimit(userId);
      expect(msgResult.allowed).toBe(true);
      expect(msgResult.remaining).toBe(9);

      // Searches should be blocked
      const searchResult = await mod.checkSearchLimit(userId);
      expect(searchResult.allowed).toBe(false);
    });

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
