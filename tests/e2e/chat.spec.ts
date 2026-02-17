import { test, expect } from "@playwright/test";

test.describe("Chat Page", () => {
  // Chat requires auth — unauthenticated users get redirected
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page shows callback URL for chat", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/chat");
  });
});

test.describe("Chat UI Elements (unauthenticated)", () => {
  // These tests verify the login page is correctly shown when
  // attempting to access chat without authentication

  test("login page has LinkedIn sign-in for chat access", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/);
    await expect(page.getByText(/linkedin/i)).toBeVisible();
    await expect(page.getByText(/sign in/i)).toBeVisible();
  });
});

test.describe("Chat Page Structure", () => {
  // These tests would run with authentication.
  // In a CI environment, you'd set up auth state via storageState.
  // For now, these validate the redirect behavior is correct.

  test("chat route is protected", async ({ page }) => {
    const response = await page.goto("/chat");
    // Should redirect (302) to login
    const finalUrl = page.url();
    expect(finalUrl).toContain("/login");
  });

  test("chat with query params preserves callback", async ({ page }) => {
    await page.goto("/chat?session=test-123");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBeTruthy();
  });
});
