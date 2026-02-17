/**
 * Unit tests for subscription-gate rate limiting.
 *
 * Note: checkRateLimit is now async (returns Promise) and private.
 * We test through the public API functions: checkMessageLimit, checkSearchLimit, checkCoverLetterLimit.
 */
import {
  checkMessageLimit,
  checkSearchLimit,
  checkCoverLetterLimit,
  peekRateLimit,
  peekMessageUsage,
  peekSearchUsage,
  peekCoverLetterUsage,
} from "./subscription-gate";

describe("checkMessageLimit", () => {
  it("should allow first message for a user", async () => {
    const result = await checkMessageLimit("test-msg-user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // FREE_LIMITS.messagesPerDay = 10
  });

  it("should block after 10 messages", async () => {
    const userId = "test-msg-user-block";
    for (let i = 0; i < 10; i++) {
      await checkMessageLimit(userId);
    }
    const result = await checkMessageLimit(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("checkSearchLimit", () => {
  it("should allow first search for a user", async () => {
    const result = await checkSearchLimit("test-search-user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // FREE_LIMITS.searchesPerDay = 5
  });

  it("should block after 5 searches", async () => {
    const userId = "test-search-user-block";
    for (let i = 0; i < 5; i++) {
      await checkSearchLimit(userId);
    }
    const result = await checkSearchLimit(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("checkCoverLetterLimit", () => {
  it("should allow first cover letter for a user", async () => {
    const result = await checkCoverLetterLimit("test-cover-user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // FREE_LIMITS.coverLettersPerWeek = 1
  });

  it("should block second cover letter", async () => {
    const userId = "test-cover-user-block";
    await checkCoverLetterLimit(userId);
    const result = await checkCoverLetterLimit(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("peekRateLimit", () => {
  it("returns full remaining when no usage exists", () => {
    const result = peekRateLimit("peek-unused-key", 10, 86400000);
    expect(result.used).toBe(0);
    expect(result.remaining).toBe(10);
    expect(result.limit).toBe(10);
  });

  it("does not consume quota (read-only)", () => {
    const key = "peek-readonly-key";
    const first = peekRateLimit(key, 10, 86400000);
    const second = peekRateLimit(key, 10, 86400000);
    expect(first).toEqual(second);
    expect(first.used).toBe(0);
  });
});

describe("peek usage functions", () => {
  it("peekMessageUsage reflects actual usage", async () => {
    const userId = "peek-msg-user";
    await checkMessageLimit(userId);
    await checkMessageLimit(userId);

    const stats = peekMessageUsage(userId);
    expect(stats.used).toBe(2);
    expect(stats.remaining).toBe(8);
    expect(stats.limit).toBe(10);
  });

  it("peekSearchUsage reflects actual usage", async () => {
    const userId = "peek-search-user";
    await checkSearchLimit(userId);

    const stats = peekSearchUsage(userId);
    expect(stats.used).toBe(1);
    expect(stats.remaining).toBe(4);
  });

  it("peekCoverLetterUsage reflects actual usage", async () => {
    const userId = "peek-cover-user";
    await checkCoverLetterLimit(userId);

    const stats = peekCoverLetterUsage(userId);
    expect(stats.used).toBe(1);
    expect(stats.remaining).toBe(0);
  });
});
