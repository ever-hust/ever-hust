import { test, expect } from "@playwright/test";

test.describe("Pricing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing");
  });

  test("renders pricing page heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /pricing/i })
    ).toBeVisible();
  });

  test("shows three pricing tiers", async ({ page }) => {
    // Free tier
    await expect(page.getByText("$0")).toBeVisible();
    // Quarterly plan
    await expect(page.getByText("$12")).toBeVisible();
    // Annual plan
    await expect(page.getByText("$7")).toBeVisible();
  });

  test("pricing cards have CTA buttons", async ({ page }) => {
    const ctaButtons = page.getByRole("link", { name: /get started/i });
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("CTA buttons link to login page", async ({ page }) => {
    const firstCta = page.getByRole("link", { name: /get started/i }).first();
    const href = await firstCta.getAttribute("href");
    expect(href).toBe("/login");
  });

  test("pricing page has proper page structure", async ({ page }) => {
    // Has header
    await expect(page.locator("header")).toBeVisible();
    // Has main content
    await expect(page.locator("main#main-content")).toBeVisible();
    // Has footer
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });

  test("pricing page has skip-to-content link", async ({ page }) => {
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toHaveCount(1);
  });
});

test.describe("Stripe API Endpoints", () => {
  test("checkout endpoint requires authentication", async ({ request }) => {
    const response = await request.post("/api/stripe/checkout", {
      data: { planId: "quarterly" },
    });
    expect(response.status()).toBe(401);
  });

  test("portal endpoint requires authentication", async ({ request }) => {
    const response = await request.post("/api/stripe/portal");
    expect(response.status()).toBe(401);
  });

  test("webhook endpoint rejects invalid signature", async ({ request }) => {
    // Webhook should accept POST but fail signature verification with 400
    const response = await request.post("/api/stripe/webhook", {
      data: {},
      headers: { "stripe-signature": "invalid" },
    });
    expect(response.status()).toBe(400);
  });

  test("webhook endpoint rejects GET requests", async ({ request }) => {
    const response = await request.get("/api/stripe/webhook");
    // Should return 405 (Method Not Allowed) or 404
    expect([404, 405]).toContain(response.status());
  });
});

test.describe("Subscription Flow (Landing Page)", () => {
  test("landing page pricing section links to login", async ({ page }) => {
    await page.goto("/");
    const pricingSection = page.locator("#pricing");
    await expect(pricingSection).toBeVisible();

    const getStartedBtn = pricingSection
      .getByRole("link", { name: /get started/i })
      .first();
    await expect(getStartedBtn).toHaveAttribute("href", "/login");
  });

  test("clicking pricing CTA navigates to login", async ({ page }) => {
    await page.goto("/pricing");
    const firstCta = page
      .getByRole("link", { name: /get started/i })
      .first();
    await firstCta.click();
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Subscription - Settings Page (Unauthenticated)", () => {
  test("settings page redirects to login", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("settings page does not expose subscription data", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.waitForURL(/\/login/);

    // Should not see subscription-related content
    const subscriptionCard = page.getByText("Subscription");
    await expect(subscriptionCard).not.toBeVisible();
  });
});
