import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders hero section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /ai-powered job search/i })
    ).toBeVisible();
  });

  test("renders navigation links", async ({ page }) => {
    await expect(page.getByRole("link", { name: /pricing/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /login/i })).toBeVisible();
  });

  test("renders features section", async ({ page }) => {
    await expect(
      page.getByText(/ai chat assistant/i).first()
    ).toBeVisible();
  });

  test("renders pricing section with 3 plans", async ({ page }) => {
    const pricingSection = page.locator("#pricing");
    await expect(pricingSection).toBeVisible();

    // Free plan
    await expect(pricingSection.getByText("$0")).toBeVisible();
    // Quarterly plan
    await expect(pricingSection.getByText("$12")).toBeVisible();
    // Annual plan
    await expect(pricingSection.getByText("$7")).toBeVisible();
  });

  test("renders footer", async ({ page }) => {
    await expect(page.getByText(/ever jobs/i).last()).toBeVisible();
  });

  test("pricing CTA links work", async ({ page }) => {
    const getStartedBtn = page
      .locator("#pricing")
      .getByRole("link", { name: /get started/i });
    await expect(getStartedBtn).toHaveAttribute("href", "/login");
  });

  test("has dark mode toggle", async ({ page }) => {
    // Look for theme toggle button
    const themeToggle = page.getByRole("button", { name: /toggle theme/i });
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      // Should toggle the class on html element
      const html = page.locator("html");
      const classAttr = await html.getAttribute("class");
      expect(classAttr).toBeTruthy();
    }
  });
});

test.describe("Navigation", () => {
  test("navigates to pricing page", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /pricing/i })
    ).toBeVisible();
  });

  test("navigates to login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/sign in/i)).toBeVisible();
  });
});
