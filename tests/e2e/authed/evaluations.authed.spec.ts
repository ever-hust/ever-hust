import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — evaluation read (#3)", () => {
  test("returns 404 for a real job the user has not evaluated yet", async ({ request }) => {
    // Job 100 exists in the 120-job seed corpus and no spec evaluates it. Not job 1: the
    // real-LLM spec (ai-tools.authed, same user, runs first on CI's single worker) asks the
    // model to evaluate job 1 and, whenever the LLM call succeeds, persists that evaluation.
    const res = await request.get("/api/evaluations/100");
    expect(res.status()).toBe(404);
  });

  test("rejects an invalid job id with 400 (auth passes first)", async ({ request }) => {
    const res = await request.get("/api/evaluations/not-a-number");
    expect(res.status()).toBe(400);
  });
});
