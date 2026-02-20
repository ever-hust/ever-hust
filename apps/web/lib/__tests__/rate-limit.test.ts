/**
 * Unit tests for the API rate limiter.
 */
import { checkApiRateLimit, API_RATE_LIMITS, applyRateLimit } from "../rate-limit";

describe("checkApiRateLimit", () => {
  it("allows requests within the limit", () => {
    const result = checkApiRateLimit("test-allow", 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("decrements remaining on each call", () => {
    const key = "test-decrement-" + Date.now();
    const first = checkApiRateLimit(key, 5, 60000);
    const second = checkApiRateLimit(key, 5, 60000);
    const third = checkApiRateLimit(key, 5, 60000);

    expect(first.remaining).toBe(4);
    expect(second.remaining).toBe(3);
    expect(third.remaining).toBe(2);
  });

  it("blocks after exceeding the limit", () => {
    const key = "test-block-" + Date.now();
    for (let i = 0; i < 3; i++) {
      checkApiRateLimit(key, 3, 60000);
    }

    const result = checkApiRateLimit(key, 3, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    const key = "test-reset-" + Date.now();
    // Use a very short window (1ms)
    for (let i = 0; i < 3; i++) {
      checkApiRateLimit(key, 3, 1);
    }

    // Wait for the window to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // spin-wait 5ms
    }

    const result = checkApiRateLimit(key, 3, 1);
    expect(result.allowed).toBe(true);
  });

  it("provides a resetAt timestamp equal to now + windowMs for allowed requests", () => {
    const key = "test-reset-at-exact-" + Date.now();
    const before = Date.now();
    const result = checkApiRateLimit(key, 5, 60000);
    const after = Date.now();
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000);
    expect(result.resetAt).toBeLessThanOrEqual(after + 60000);
  });

  it("provides resetAt = oldest + windowMs when blocked", () => {
    const key = "test-reset-at-blocked-" + Date.now();
    const before = Date.now();
    for (let i = 0; i < 2; i++) {
      checkApiRateLimit(key, 2, 60000);
    }
    const blocked = checkApiRateLimit(key, 2, 60000);
    expect(blocked.allowed).toBe(false);
    // resetAt should be approximately first_timestamp + 60000
    expect(blocked.resetAt).toBeGreaterThanOrEqual(before + 60000);
    expect(blocked.resetAt).toBeLessThanOrEqual(Date.now() + 60000);
  });

  it("works correctly with limit=1", () => {
    const key = "test-limit-one-" + Date.now();
    const first = checkApiRateLimit(key, 1, 60000);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(0);

    const second = checkApiRateLimit(key, 1, 60000);
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
  });

  it("isolates different keys", () => {
    const keyA = "test-isolate-a-" + Date.now();
    const keyB = "test-isolate-b-" + Date.now();

    // Exhaust keyA
    for (let i = 0; i < 2; i++) {
      checkApiRateLimit(keyA, 2, 60000);
    }
    const blockedA = checkApiRateLimit(keyA, 2, 60000);
    expect(blockedA.allowed).toBe(false);

    // keyB should still be allowed
    const allowedB = checkApiRateLimit(keyB, 2, 60000);
    expect(allowedB.allowed).toBe(true);
  });
});

describe("API_RATE_LIMITS config", () => {
  it("has authenticated tier", () => {
    expect(API_RATE_LIMITS.authenticated).toBeDefined();
    expect(API_RATE_LIMITS.authenticated.limit).toBe(100);
    expect(API_RATE_LIMITS.authenticated.windowMs).toBe(60000);
  });

  it("has public tier", () => {
    expect(API_RATE_LIMITS.public).toBeDefined();
    expect(API_RATE_LIMITS.public.limit).toBe(20);
  });

  it("has chat tier with stricter limits", () => {
    expect(API_RATE_LIMITS.chat).toBeDefined();
    expect(API_RATE_LIMITS.chat.limit).toBeLessThan(
      API_RATE_LIMITS.authenticated.limit
    );
  });

  it("has export tier with the strictest limits", () => {
    expect(API_RATE_LIMITS.export).toBeDefined();
    expect(API_RATE_LIMITS.export.limit).toBeLessThan(
      API_RATE_LIMITS.chat.limit
    );
  });

  it("has admin tier", () => {
    expect(API_RATE_LIMITS.admin).toBeDefined();
    expect(API_RATE_LIMITS.admin.limit).toBe(60);
  });

  it("has adminWrite tier with stricter limits than admin", () => {
    expect(API_RATE_LIMITS.adminWrite).toBeDefined();
    expect(API_RATE_LIMITS.adminWrite.limit).toBeLessThan(
      API_RATE_LIMITS.admin.limit
    );
  });

  it("has publicHighThroughput tier", () => {
    expect(API_RATE_LIMITS.publicHighThroughput).toBeDefined();
    expect(API_RATE_LIMITS.publicHighThroughput.limit).toBe(100);
  });

  it("all tiers have positive limits and window durations", () => {
    for (const [, config] of Object.entries(API_RATE_LIMITS)) {
      expect(config.limit).toBeGreaterThan(0);
      expect(config.windowMs).toBeGreaterThan(0);
    }
  });
});

describe("applyRateLimit", () => {
  it("returns null when under the limit", () => {
    const key = "apply-test-allow-" + Date.now();
    const result = applyRateLimit(key, "authenticated");
    expect(result).toBeNull();
  });

  it("returns 429 response when limit exceeded", () => {
    const key = "apply-test-block-" + Date.now();
    // Export tier has limit of 5
    for (let i = 0; i < 5; i++) {
      applyRateLimit(key, "export");
    }
    const result = applyRateLimit(key, "export");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get("Retry-After")).toBeTruthy();
    expect(result!.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(result!.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("includes X-RateLimit-Reset header on 429", () => {
    const key = "apply-reset-header-" + Date.now();
    for (let i = 0; i < 5; i++) {
      applyRateLimit(key, "export");
    }
    const result = applyRateLimit(key, "export");
    expect(result).not.toBeNull();
    const resetHeader = result!.headers.get("X-RateLimit-Reset");
    expect(resetHeader).toBeTruthy();
    // Should be a Unix timestamp in seconds (current epoch range)
    const resetTs = Number(resetHeader);
    expect(resetTs).toBeGreaterThan(1_000_000_000);
  });

  it("isolates same key across different tiers", () => {
    const key = "apply-tier-isolate-" + Date.now();
    // Exhaust export tier (limit 5)
    for (let i = 0; i < 5; i++) {
      applyRateLimit(key, "export");
    }
    const exportBlocked = applyRateLimit(key, "export");
    expect(exportBlocked).not.toBeNull();

    // Same base key but different tier should still be allowed
    const chatAllowed = applyRateLimit(key, "chat");
    expect(chatAllowed).toBeNull();
  });

  it("returns 429 response body with retryAfter and error message", async () => {
    const key = "apply-body-check-" + Date.now();
    for (let i = 0; i < 5; i++) {
      applyRateLimit(key, "export");
    }
    const result = applyRateLimit(key, "export");
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.error).toContain("Too many requests");
    expect(typeof body.retryAfter).toBe("number");
    expect(body.retryAfter).toBeGreaterThan(0);
  });
});
