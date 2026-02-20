import { test, expect } from "@playwright/test";

test.describe("Jobs Page - Auth Redirect", () => {
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

test.describe("Job Detail Page - Auth Redirect", () => {
  test("redirects to login when accessing job detail", async ({ page }) => {
    await page.goto("/jobs/1");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("preserves callback URL for job detail", async ({ page }) => {
    await page.goto("/jobs/1");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/jobs/1");
  });

  test("preserves callback URL for deep job links", async ({ page }) => {
    await page.goto("/jobs/12345");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/jobs/12345");
  });
});

test.describe("Favorites Page - Auth Redirect", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/favorites");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("preserves callback URL for favorites page", async ({ page }) => {
    await page.goto("/favorites");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/favorites");
  });
});

test.describe("Applications Page - Auth Redirect", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/applications");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("preserves callback URL for applications page", async ({ page }) => {
    await page.goto("/applications");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/applications");
  });
});

test.describe("Jobs API", () => {
  test("search endpoint returns JSON response", async ({ request }) => {
    const response = await request.get("/api/jobs/search?page=1&limit=5");
    const status = response.status();
    // API should return 200 (possibly with empty results) — 500 indicates a real failure
    expect(status).toBe(200);
    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");
  });

  test("search endpoint accepts filter params", async ({ request }) => {
    const response = await request.get(
      "/api/jobs/search?keywords=react&location=remote&page=1&limit=5"
    );
    expect(response.status()).toBe(200);
  });

  test("job detail endpoint returns JSON for valid id", async ({ request }) => {
    const response = await request.get("/api/jobs/1");
    // 200 if job exists, 404 if not — both are valid; 500 is a failure
    expect([200, 404]).toContain(response.status());
    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");
  });
});

test.describe("Jobs API - User Endpoints", () => {
  test("favorites endpoint requires authentication", async ({ request }) => {
    const response = await request.get("/api/user/favorites");
    expect(response.status()).toBe(401);
  });

  test("adding a favorite requires authentication", async ({ request }) => {
    const response = await request.post("/api/user/favorites", {
      data: { jobId: 1 },
    });
    expect(response.status()).toBe(401);
  });

  test("removing a favorite requires authentication", async ({ request }) => {
    const response = await request.delete("/api/user/favorites", {
      data: { jobId: 1 },
    });
    expect(response.status()).toBe(401);
  });
});
