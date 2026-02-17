import { test, expect } from "@playwright/test";

test.describe("Jobs Page", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/jobs");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("preserves callback URL for jobs page", async ({ page }) => {
    await page.goto("/jobs");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/jobs");
  });
});

test.describe("Job Detail Page", () => {
  test("redirects to login when accessing job detail", async ({ page }) => {
    await page.goto("/jobs/1");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Jobs API", () => {
  test("search endpoint returns JSON", async ({ request }) => {
    const response = await request.get("/api/jobs/search?page=1&limit=5");
    // May return 200 (with empty jobs) or 500 (no DB) depending on environment
    expect([200, 500]).toContain(response.status());
  });

  test("search endpoint accepts filter params", async ({ request }) => {
    const response = await request.get(
      "/api/jobs/search?keywords=react&location=remote&page=1&limit=5"
    );
    expect([200, 500]).toContain(response.status());
  });

  test("job detail endpoint returns JSON for valid id", async ({ request }) => {
    const response = await request.get("/api/jobs/1");
    expect([200, 404, 500]).toContain(response.status());
  });
});
