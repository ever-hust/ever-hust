import { test, expect } from "@playwright/test";

test.describe("Profile Page", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe("Authenticated User", () => {
    test.skip("renders profile page with user sections", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/profile");
      await expect(
        page.getByRole("heading", { name: /profile/i })
      ).toBeVisible();
    });

    test.skip("displays skills section", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/profile");
      await expect(
        page.getByRole("heading", { name: /skills/i })
      ).toBeVisible();
    });

    test.skip("displays preferences section", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/profile");
      await expect(
        page.getByRole("heading", { name: /preferences/i })
      ).toBeVisible();
    });

    test.skip("displays CV upload section", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/profile");
      await expect(
        page.getByRole("heading", { name: /cv|resume/i })
      ).toBeVisible();
    });

    test.skip("displays favorites section", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/profile");
      await expect(
        page.getByRole("heading", { name: /favorites|saved jobs/i })
      ).toBeVisible();
    });
  });
});
