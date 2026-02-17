import { test, expect } from "@playwright/test";

test.describe("Profile Page", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("preserves callback URL for profile", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/profile");
  });
});

test.describe("Settings Page", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("preserves callback URL for settings", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/settings");
  });
});

test.describe("Profile API", () => {
  test("profile endpoint requires authentication", async ({ request }) => {
    const response = await request.get("/api/user/profile");
    expect(response.status()).toBe(401);
  });

  test("favorites endpoint requires authentication", async ({ request }) => {
    const response = await request.get("/api/user/favorites");
    expect(response.status()).toBe(401);
  });

  test("settings endpoint requires authentication", async ({ request }) => {
    const response = await request.patch("/api/user/settings", {
      data: { name: "Test" },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("Alerts API", () => {
  test("alerts GET requires authentication", async ({ request }) => {
    const response = await request.get("/api/user/alerts");
    expect(response.status()).toBe(401);
  });

  test("alerts POST requires authentication", async ({ request }) => {
    const response = await request.post("/api/user/alerts", {
      data: { frequency: "daily", email: "test@test.com" },
    });
    expect(response.status()).toBe(401);
  });

  test("alerts PATCH requires authentication", async ({ request }) => {
    const response = await request.patch("/api/user/alerts", {
      data: { id: 1, isActive: false },
    });
    expect(response.status()).toBe(401);
  });

  test("alerts DELETE requires authentication", async ({ request }) => {
    const response = await request.delete("/api/user/alerts", {
      data: { id: 1 },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("CV Upload API", () => {
  test("upload endpoint requires authentication", async ({ request }) => {
    const response = await request.post("/api/cv/upload");
    expect(response.status()).toBe(401);
  });
});
