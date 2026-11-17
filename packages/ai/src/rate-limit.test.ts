import {
  checkSearchLimit,
  checkCoverLetterLimit,
  peekSearchLimit,
  peekCoverLetterLimit,
} from "./rate-limit";

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

describe("peekSearchLimit", () => {
  it("reports the searches checkSearchLimit consumed without consuming one", async () => {
    const userId = "test-user-peek-search";
    await checkSearchLimit(userId); // 1
    await checkSearchLimit(userId); // 2

    expect(await peekSearchLimit(userId)).toEqual({ used: 2, remaining: 3, limit: 5 });
    expect(await peekSearchLimit(userId)).toEqual({ used: 2, remaining: 3, limit: 5 });

    // The peeks did not consume: the third search still leaves 2.
    const third = await checkSearchLimit(userId);
    expect(third.remaining).toBe(2);
  });

  it("returns 0 used for a user with no searches", async () => {
    expect(await peekSearchLimit("test-user-peek-search-none")).toEqual({
      used: 0,
      remaining: 5,
      limit: 5,
    });
  });

  it("returns 0 used once the day window has passed", async () => {
    const userId = "test-user-peek-search-expired";
    const start = Date.now();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(start);
    try {
      await checkSearchLimit(userId);
      expect((await peekSearchLimit(userId)).used).toBe(1);

      nowSpy.mockReturnValue(start + 24 * 60 * 60 * 1000 + 1);
      expect(await peekSearchLimit(userId)).toEqual({ used: 0, remaining: 5, limit: 5 });
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("peekCoverLetterLimit", () => {
  it("reports the cover letter checkCoverLetterLimit consumed", async () => {
    const userId = "test-user-peek-cover";
    await checkCoverLetterLimit(userId);

    expect(await peekCoverLetterLimit(userId)).toEqual({ used: 1, remaining: 0, limit: 1 });
  });

  it("returns 0 used for a user with no cover letters", async () => {
    expect(await peekCoverLetterLimit("test-user-peek-cover-none")).toEqual({
      used: 0,
      remaining: 1,
      limit: 1,
    });
  });
});

describe("peek with Upstash configured", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
  const mockGetRemaining = jest.fn();
  const mockLimit = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockGetRemaining.mockReset();
    mockLimit.mockReset();
    env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    jest.doMock("@upstash/redis", () => ({ Redis: class {} }));
    jest.doMock("@upstash/ratelimit", () => ({
      Ratelimit: class {
        static slidingWindow = () => ({});
        getRemaining = mockGetRemaining;
        limit = mockLimit;
      },
    }));
  });

  afterEach(() => {
    jest.dontMock("@upstash/redis");
    jest.dontMock("@upstash/ratelimit");
    jest.resetModules();
    env.UPSTASH_REDIS_REST_URL = saved.url;
    env.UPSTASH_REDIS_REST_TOKEN = saved.token;
  });

  it("reads the Upstash limiter's remaining count without consuming", async () => {
    mockGetRemaining.mockResolvedValue({ remaining: 3, reset: 0, limit: 5 });
    const mod = await import("./rate-limit");

    expect(await mod.peekSearchLimit("u1")).toEqual({ used: 2, remaining: 3, limit: 5 });
    expect(mockGetRemaining).toHaveBeenCalledWith("u1");
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("reports a used cover letter from Upstash", async () => {
    mockGetRemaining.mockResolvedValue({ remaining: 0, reset: 0, limit: 1 });
    const mod = await import("./rate-limit");

    expect(await mod.peekCoverLetterLimit("u1")).toEqual({ used: 1, remaining: 0, limit: 1 });
    expect(mockLimit).not.toHaveBeenCalled();
  });
});
