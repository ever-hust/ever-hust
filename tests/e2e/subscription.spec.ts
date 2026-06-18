import { test, expect } from "@playwright/test";

// The public Pricing/landing pages moved to the marketing site (hust.so); their
// tests live there. This spec now covers the in-app Stripe API + settings surface.

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
