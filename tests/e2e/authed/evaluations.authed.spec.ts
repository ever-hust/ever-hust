import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — evaluation read (#3)", () => {
  test("returns 404 for a real job the user has not evaluated yet", async ({ request }) => {
    // Job 1 exists in the corpus, but the seeded user has no persisted evaluation for it.
    const res = await request.get("/api/evaluations/1");
    expect(res.status()).toBe(404);
  });

  test("rejects an invalid job id with 400 (auth passes first)", async ({ request }) => {
    const res = await request.get("/api/evaluations/not-a-number");
    expect(res.status()).toBe(400);
  });
});
