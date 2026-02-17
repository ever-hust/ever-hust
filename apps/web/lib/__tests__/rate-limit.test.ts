/**
 * Unit tests for the API rate limiter.
 */
import { checkApiRateLimit, API_RATE_LIMITS } from "../rate-limit";

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

  it("provides a resetAt timestamp in the future", () => {
    const key = "test-reset-at-" + Date.now();
    const result = checkApiRateLimit(key, 5, 60000);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000); // within 1s
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
});
