import { test, expect } from "@playwright/test";

test.describe("Chat/Dashboard Page", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe("Authenticated User", () => {
    test.skip("loads chat page with sidebar navigation", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/chat");
      await expect(page.getByRole("navigation")).toBeVisible();
      await expect(
        page.getByRole("link", { name: /chat/i })
      ).toBeVisible();
    });

    test.skip("displays chat input area", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/chat");
      await expect(
        page.getByPlaceholder(/type your message/i)
      ).toBeVisible();
    });

    test.skip("shows suggestion prompts in empty state", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/chat");
      const suggestions = page.getByRole("button", {
        name: /find me jobs/i,
      });
      await expect(suggestions.first()).toBeVisible();
    });

    test.skip("mobile view has panel toggle", async ({ page }) => {
      // This test requires authentication setup
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/chat");
      await expect(
        page.getByRole("button", { name: /toggle menu/i })
      ).toBeVisible();
    });
  });
});
