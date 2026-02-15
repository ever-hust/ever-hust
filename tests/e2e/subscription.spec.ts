import { test, expect } from "@playwright/test";

test.describe("Subscription/Pricing", () => {
  test.describe("Pricing Page", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/pricing");
    });

    test("is accessible without authentication", async ({ page }) => {
      await expect(page).toHaveURL(/\/pricing/);
      await expect(
        page.getByRole("heading", { name: /pricing/i })
      ).toBeVisible();
    });

    test("shows Free plan at $0", async ({ page }) => {
      const freePlan = page.getByRole("article").filter({
        hasText: /free/i,
      });
      await expect(freePlan).toBeVisible();
      await expect(freePlan.getByText(/\$0/)).toBeVisible();
    });

    test("shows Quarterly plan at $12", async ({ page }) => {
      const quarterlyPlan = page.getByRole("article").filter({
        hasText: /quarterly/i,
      });
      await expect(quarterlyPlan).toBeVisible();
      await expect(quarterlyPlan.getByText(/\$12/)).toBeVisible();
    });

    test("shows Annual plan at $7", async ({ page }) => {
      const annualPlan = page.getByRole("article").filter({
        hasText: /annual/i,
      });
      await expect(annualPlan).toBeVisible();
      await expect(annualPlan.getByText(/\$7/)).toBeVisible();
    });

    test("Free plan has Get Started CTA linking to login", async ({
      page,
    }) => {
      const freePlan = page.getByRole("article").filter({
        hasText: /free/i,
      });
      const getStartedButton = freePlan.getByRole("link", {
        name: /get started/i,
      });
      await expect(getStartedButton).toBeVisible();
      await expect(getStartedButton).toHaveAttribute("href", /\/login/);
    });
  });

  test.describe("Settings Page", () => {
    test("redirects unauthenticated users to login", async ({ page }) => {
      await page.goto("/settings");
      await page.waitForURL(/\/login/);
      await expect(page).toHaveURL(/\/login/);
    });

    test.skip("authenticated user can access settings", async ({ page }) => {
      // This test requires authentication setup
      await page.goto("/settings");
      await expect(
        page.getByRole("heading", { name: /settings/i })
      ).toBeVisible();
    });
  });
});
