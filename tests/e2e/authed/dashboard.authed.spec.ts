import { test, expect } from "@playwright/test";

// Authenticated via the storage state produced by the `setup` project (auth.setup.ts).
test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — dashboard + user APIs", () => {
  test("loads /dashboard without redirecting to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("user applications API returns 200 with the pipeline shape", async ({ request }) => {
    const res = await request.get("/api/user/applications");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.applications)).toBe(true);
  });

  test("user favorites API returns 200", async ({ request }) => {
    const res = await request.get("/api/user/favorites");
    expect(res.status()).toBe(200);
  });

  test("evaluations read endpoint is reachable when authenticated (404 for an unknown job, not 401)", async ({
    request,
  }) => {
    const res = await request.get("/api/evaluations/999999");
    expect(res.status()).not.toBe(401);
    expect([200, 404]).toContain(res.status());
  });
});
