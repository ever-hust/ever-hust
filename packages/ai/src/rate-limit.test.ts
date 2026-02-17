import { checkSearchLimit, checkCoverLetterLimit } from "./rate-limit";

describe("checkSearchLimit", () => {
  it("should allow first search for a user", () => {
    const result = checkSearchLimit("test-user-search-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // FREE_LIMITS.searchesPerDay = 5, minus 1
  });

  it("should track consecutive searches", () => {
    const userId = "test-user-search-track";
    checkSearchLimit(userId); // 1
    checkSearchLimit(userId); // 2
    const result = checkSearchLimit(userId); // 3
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("should block after limit is reached", () => {
    const userId = "test-user-search-limit";
    for (let i = 0; i < 5; i++) {
      checkSearchLimit(userId);
    }
    const result = checkSearchLimit(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should use different counters for different users", () => {
    const result1 = checkSearchLimit("test-user-search-a");
    const result2 = checkSearchLimit("test-user-search-b");
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result1.remaining).toBe(4);
    expect(result2.remaining).toBe(4);
  });
});

describe("checkCoverLetterLimit", () => {
  it("should allow first cover letter for a user", () => {
    const result = checkCoverLetterLimit("test-user-cover-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // FREE_LIMITS.coverLettersPerWeek = 1
  });

  it("should block second cover letter within the week", () => {
    const userId = "test-user-cover-block";
    checkCoverLetterLimit(userId); // 1st - uses the single allowed one
    const result = checkCoverLetterLimit(userId); // 2nd - should be blocked
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should use different counters for different users", () => {
    const result1 = checkCoverLetterLimit("test-user-cover-a");
    const result2 = checkCoverLetterLimit("test-user-cover-b");
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
  });
});
