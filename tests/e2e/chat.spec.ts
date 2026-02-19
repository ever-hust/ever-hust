import { test, expect } from "@playwright/test";

test.describe("Chat Page - Auth Redirect", () => {
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

  test("chat with query params preserves callback", async ({ page }) => {
    await page.goto("/chat?session=test-123");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBeTruthy();
  });
});

test.describe("Chat UI - Login Prompt", () => {
  test("login page has LinkedIn sign-in for chat access", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/);
    await expect(page.getByText(/linkedin/i)).toBeVisible();
    await expect(page.getByText(/sign in/i)).toBeVisible();
  });
});

test.describe("Chat Route Protection", () => {
  test("chat route is protected and redirects", async ({ page }) => {
    const response = await page.goto("/chat");
    // Should redirect (302) to login
    const finalUrl = page.url();
    expect(finalUrl).toContain("/login");
  });

  test("chat does not expose any content to unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/);

    // Should not see any chat UI elements
    const chatInput = page.locator('[data-testid="chat-input"]');
    await expect(chatInput).not.toBeVisible();
  });
});

test.describe("Chat AI API", () => {
  test("AI chat endpoint requires authentication", async ({ request }) => {
    const response = await request.post("/api/ai/chat", {
      data: {
        messages: [{ role: "user", content: "Hello" }],
      },
    });
    // Should return 401 (unauthenticated)
    expect(response.status()).toBe(401);
  });
});
