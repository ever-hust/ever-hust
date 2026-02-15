import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("redirects unauthenticated users from dashboard to login", async ({
    page,
  }) => {
    await page.goto("/chat");
    // Should redirect to login page since there's no session cookie
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page shows LinkedIn sign-in button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/linkedin/i)).toBeVisible();
  });

  test("settings page requires authentication", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("profile page requires authentication", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });
});
