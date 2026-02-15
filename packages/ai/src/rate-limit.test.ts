import { checkSearchLimit, checkCoverLetterLimit } from "./rate-limit";

describe("checkSearchLimit", () => {
  it("should allow first search for a user", async () => {
    const userId = "user_search_1";
    const result = await checkSearchLimit(userId);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("should track usage correctly", async () => {
    const userId = "user_search_2";

    const first = await checkSearchLimit(userId);
    expect(first.allowed).toBe(true);
    const firstRemaining = first.remaining;

    const second = await checkSearchLimit(userId);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(firstRemaining - 1);
  });

  it("should block after limit is reached", async () => {
    const userId = "user_search_3";

    // Consume all allowed searches (default is 5 per day)
    for (let i = 0; i < 5; i++) {
      const result = await checkSearchLimit(userId);
      expect(result.allowed).toBe(true);
    }

    // Next search should be blocked
    const blocked = await checkSearchLimit(userId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("should have separate counters for different users", async () => {
    const userA = "user_search_a";
    const userB = "user_search_b";

    // User A makes searches
    await checkSearchLimit(userA);
    await checkSearchLimit(userA);
    const resultA = await checkSearchLimit(userA);

    // User B's first search should not be affected
    const resultB = await checkSearchLimit(userB);

    expect(resultA.remaining).toBeLessThan(resultB.remaining);
  });

  it("should reset after time window expires", async () => {
    const userId = "user_search_reset";

    // Mock timers
    jest.useFakeTimers();
    const startTime = Date.now();
    jest.setSystemTime(startTime);

    // Use up some searches
    await checkSearchLimit(userId);
    await checkSearchLimit(userId);
    const beforeReset = await checkSearchLimit(userId);
    expect(beforeReset.allowed).toBe(true);

    // Advance time by more than 24 hours (rate limit window)
    const oneDayMs = 24 * 60 * 60 * 1000;
    jest.setSystemTime(startTime + oneDayMs + 1000);

    // Should reset and allow search again
    const afterReset = await checkSearchLimit(userId);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBeGreaterThan(beforeReset.remaining);

    jest.useRealTimers();
  });

  it("should not reset before time window expires", async () => {
    const userId = "user_search_no_reset";

    jest.useFakeTimers();
    const startTime = Date.now();
    jest.setSystemTime(startTime);

    // Use searches
    await checkSearchLimit(userId);
    await checkSearchLimit(userId);

    // Advance time by less than 24 hours
    const halfDayMs = 12 * 60 * 60 * 1000;
    jest.setSystemTime(startTime + halfDayMs);

    // Counter should still be tracking
    const result = await checkSearchLimit(userId);
    expect(result.remaining).toBeLessThan(4); // Should have used 3 total

    jest.useRealTimers();
  });
});

describe("checkCoverLetterLimit", () => {
  it("should allow first cover letter for a user", async () => {
    const userId = "user_cover_1";
    const result = await checkCoverLetterLimit(userId);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it("should track usage correctly", async () => {
    const userId = "user_cover_2";

    const first = await checkCoverLetterLimit(userId);
    expect(first.allowed).toBe(true);

    // Cover letter limit is 1 per week, so second should be blocked
    const second = await checkCoverLetterLimit(userId);
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
  });

  it("should have separate counters for different users", async () => {
    const userA = "user_cover_a";
    const userB = "user_cover_b";

    // User A uses their cover letter
    const resultA = await checkCoverLetterLimit(userA);
    expect(resultA.allowed).toBe(true);

    // User B should still be able to generate
    const resultB = await checkCoverLetterLimit(userB);
    expect(resultB.allowed).toBe(true);
  });

  it("should reset after one week", async () => {
    const userId = "user_cover_reset";

    jest.useFakeTimers();
    const startTime = Date.now();
    jest.setSystemTime(startTime);

    // Use the weekly limit
    const first = await checkCoverLetterLimit(userId);
    expect(first.allowed).toBe(true);

    const blocked = await checkCoverLetterLimit(userId);
    expect(blocked.allowed).toBe(false);

    // Advance time by more than 7 days
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    jest.setSystemTime(startTime + oneWeekMs + 1000);

    // Should reset and allow cover letter again
    const afterReset = await checkCoverLetterLimit(userId);
    expect(afterReset.allowed).toBe(true);

    jest.useRealTimers();
  });

  it("should not reset before one week", async () => {
    const userId = "user_cover_no_reset";

    jest.useFakeTimers();
    const startTime = Date.now();
    jest.setSystemTime(startTime);

    // Use the limit
    await checkCoverLetterLimit(userId);

    // Advance by 5 days
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    jest.setSystemTime(startTime + fiveDaysMs);

    // Should still be blocked
    const result = await checkCoverLetterLimit(userId);
    expect(result.allowed).toBe(false);

    jest.useRealTimers();
  });
});

describe("rate limit isolation", () => {
  it("should keep search and cover letter limits separate", async () => {
    const userId = "user_isolation";

    // Use up search limit
    for (let i = 0; i < 5; i++) {
      await checkSearchLimit(userId);
    }
    const searchResult = await checkSearchLimit(userId);
    expect(searchResult.allowed).toBe(false);

    // Cover letter should still be available
    const coverResult = await checkCoverLetterLimit(userId);
    expect(coverResult.allowed).toBe(true);
  });

  it("should maintain separate time windows", async () => {
    const userId = "user_windows";

    jest.useFakeTimers();
    const startTime = Date.now();
    jest.setSystemTime(startTime);

    // Use both limits
    await checkSearchLimit(userId);
    await checkCoverLetterLimit(userId);

    // Advance by 1 day (search window resets, cover letter doesn't)
    const oneDayMs = 24 * 60 * 60 * 1000;
    jest.setSystemTime(startTime + oneDayMs + 1000);

    const searchResult = await checkSearchLimit(userId);
    expect(searchResult.allowed).toBe(true);

    const coverResult = await checkCoverLetterLimit(userId);
    expect(coverResult.allowed).toBe(false); // Still blocked, needs 7 days

    jest.useRealTimers();
  });
});
