import { checkSearchLimit, checkCoverLetterLimit } from "./rate-limit";

describe("checkSearchLimit", () => {
  it("should allow first search for a user", async () => {
    const result = await checkSearchLimit("test-user-search-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // FREE_LIMITS.searchesPerDay = 5, minus 1
  });

  it("should track consecutive searches", async () => {
    const userId = "test-user-search-track";
    await checkSearchLimit(userId); // 1
    await checkSearchLimit(userId); // 2
    const result = await checkSearchLimit(userId); // 3
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("should block after limit is reached", async () => {
    const userId = "test-user-search-limit";
    for (let i = 0; i < 5; i++) {
      await checkSearchLimit(userId);
    }
    const result = await checkSearchLimit(userId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should use different counters for different users", async () => {
    const result1 = await checkSearchLimit("test-user-search-a");
    const result2 = await checkSearchLimit("test-user-search-b");
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result1.remaining).toBe(4);
    expect(result2.remaining).toBe(4);
  });
});

describe("checkCoverLetterLimit", () => {
  it("should allow first cover letter for a user", async () => {
    const result = await checkCoverLetterLimit("test-user-cover-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // FREE_LIMITS.coverLettersPerWeek = 1
  });

  it("should block second cover letter within the week", async () => {
    const userId = "test-user-cover-block";
    await checkCoverLetterLimit(userId); // 1st - uses the single allowed one
    const result = await checkCoverLetterLimit(userId); // 2nd - should be blocked
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should use different counters for different users", async () => {
    const result1 = await checkCoverLetterLimit("test-user-cover-a");
    const result2 = await checkCoverLetterLimit("test-user-cover-b");
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
  });
});
