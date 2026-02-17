import { checkRateLimit, checkMessageLimit, checkSearchLimit, checkCoverLetterLimit } from "./subscription-gate";

describe("checkRateLimit", () => {
  it("should allow the first request", () => {
    const result = checkRateLimit("test-rate-1", 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("should track consecutive requests", () => {
    const key = "test-rate-track";
    checkRateLimit(key, 5, 60000);
    checkRateLimit(key, 5, 60000);
    const result = checkRateLimit(key, 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("should block after limit is reached", () => {
    const key = "test-rate-block";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60000);
    }
    const result = checkRateLimit(key, 5, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should use separate counters for different keys", () => {
    const result1 = checkRateLimit("test-rate-a", 3, 60000);
    const result2 = checkRateLimit("test-rate-b", 3, 60000);
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result1.remaining).toBe(2);
    expect(result2.remaining).toBe(2);
  });
});

describe("checkMessageLimit", () => {
  it("should allow first message for a user", () => {
    const result = checkMessageLimit("test-msg-user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // FREE_LIMITS.messagesPerDay = 10
  });

  it("should block after 10 messages", () => {
    const userId = "test-msg-user-block";
    for (let i = 0; i < 10; i++) {
      checkMessageLimit(userId);
    }
    const result = checkMessageLimit(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("checkSearchLimit", () => {
  it("should allow first search for a user", () => {
    const result = checkSearchLimit("test-search-user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // FREE_LIMITS.searchesPerDay = 5
  });
});

describe("checkCoverLetterLimit", () => {
  it("should allow first cover letter for a user", () => {
    const result = checkCoverLetterLimit("test-cover-user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // FREE_LIMITS.coverLettersPerWeek = 1
  });

  it("should block second cover letter", () => {
    const userId = "test-cover-user-block";
    checkCoverLetterLimit(userId);
    const result = checkCoverLetterLimit(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
