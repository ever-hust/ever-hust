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
    await expect(page.getByText(/hust/i).last()).toBeVisible();
  });

  test("pricing CTA links work", async ({ page }) => {
    const getStartedBtn = page
      .locator("#pricing")
      .getByRole("link", { name: /get started/i });
    await expect(getStartedBtn).toHaveAttribute("href", "/login");
  });

  test("has dark mode toggle", async ({ page }) => {
    const themeToggle = page.getByRole("button", { name: /toggle theme/i });
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    // Should toggle the class on html element
    const html = page.locator("html");
    const classAttr = await html.getAttribute("class");
    expect(classAttr).toBeTruthy();
  });

  test("has structured data (JSON-LD) for SEO", async ({ page }) => {
    const jsonLd = page.locator('script[type="application/ld+json"]');
    const count = await jsonLd.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("has proper meta description", async ({ page }) => {
    const metaDesc = page.locator('meta[name="description"]');
    const content = await metaDesc.getAttribute("content");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(0);
  });

  test("has proper Open Graph meta tags", async ({ page }) => {
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /.+/);

    const ogDescription = page.locator('meta[property="og:description"]');
    await expect(ogDescription).toHaveAttribute("content", /.+/);
  });
});

test.describe("Landing Page - Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("has exactly one h1 heading", async ({ page }) => {
    const h1 = page.locator("h1");
    const count = await h1.count();
    expect(count).toBe(1);
  });

  test("has header, main, and footer landmarks", async ({ page }) => {
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });

  test("has a skip-to-content link", async ({ page }) => {
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toHaveCount(1);
  });

  test("navbar has proper aria-label", async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();
  });

  test("images and icons have alt text or are aria-hidden", async ({
    page,
  }) => {
    // All decorative icons should have aria-hidden="true"
    const ariaHiddenIcons = page.locator('svg[aria-hidden="true"]');
    const count = await ariaHiddenIcons.count();
    expect(count).toBeGreaterThan(0);
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

  test("navigates to about page", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: /about hust/i })
    ).toBeVisible();
  });

  test("navigates to contact page", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: /contact us/i }).first()
    ).toBeVisible();
  });

  test("navigates to terms page", async ({ page }) => {
    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { name: /terms of service/i }).first()
    ).toBeVisible();
  });

  test("navigates to privacy page", async ({ page }) => {
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: /privacy policy/i }).first()
    ).toBeVisible();
  });
});
