import { test, expect } from "@playwright/test";

test.describe("Evaluation API - auth", () => {
  test("evaluation read endpoint requires authentication", async ({ request }) => {
    const response = await request.get("/api/evaluations/1");
    // Should return 401 (unauthenticated) — auth is checked before anything else.
    expect(response.status()).toBe(401);
  });

  test("auth is enforced before id validation", async ({ request }) => {
    const response = await request.get("/api/evaluations/not-a-number");
    expect(response.status()).toBe(401);
  });
});
