import { test, expect } from "@playwright/test";

test.describe("Authentication - Protected Route Redirects", () => {
  const protectedRoutes = [
    { path: "/chat", name: "Chat" },
    { path: "/jobs", name: "Jobs" },
    { path: "/profile", name: "Profile" },
    { path: "/settings", name: "Settings" },
    { path: "/applications", name: "Applications" },
    { path: "/favorites", name: "Favorites" },
    { path: "/organizations", name: "Organizations" },
  ];

  for (const { path, name } of protectedRoutes) {
    test(`${name} page redirects unauthenticated users to login`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.waitForURL(/\/login/);
      await expect(page).toHaveURL(/\/login/);
    });

    test(`${name} page preserves callback URL`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login/);
      const url = new URL(page.url());
      expect(url.searchParams.get("callbackUrl")).toBe(path);
    });
  }
});

test.describe("Authentication - Login Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("login page shows LinkedIn sign-in button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /continue with linkedin/i })
    ).toBeVisible();
  });

  test("login page shows sign-in heading", async ({ page }) => {
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });

  test("login page is accessible without authentication", async ({
    page,
  }) => {
    // Should not redirect away — login is a public page
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Authentication - Callback URLs", () => {
  test("chat page redirect includes callbackUrl", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/chat");
  });

  test("settings/api-docs redirect includes callbackUrl", async ({
    page,
  }) => {
    await page.goto("/settings/api-docs");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/settings/api-docs");
  });

  test("nested jobs route redirect includes callbackUrl", async ({
    page,
  }) => {
    await page.goto("/jobs/123");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/jobs/123");
  });

  test("organization detail redirect includes callbackUrl", async ({
    page,
  }) => {
    await page.goto("/organizations/1");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/organizations/1");
  });
});

test.describe("Authentication - API Endpoint Protection", () => {
  test("user profile endpoint returns 401", async ({ request }) => {
    const response = await request.get("/api/user/profile");
    expect(response.status()).toBe(401);
  });

  test("user favorites endpoint returns 401", async ({ request }) => {
    const response = await request.get("/api/user/favorites");
    expect(response.status()).toBe(401);
  });

  test("user settings PATCH returns 401", async ({ request }) => {
    const response = await request.patch("/api/user/settings", {
      data: { name: "Test" },
    });
    expect(response.status()).toBe(401);
  });

  test("user alerts endpoint returns 401", async ({ request }) => {
    const response = await request.get("/api/user/alerts");
    expect(response.status()).toBe(401);
  });

  test("CV upload endpoint returns 401", async ({ request }) => {
    const response = await request.post("/api/cv/upload");
    expect(response.status()).toBe(401);
  });

  test("Stripe checkout returns 401", async ({ request }) => {
    const response = await request.post("/api/stripe/checkout", {
      data: { planId: "quarterly" },
    });
    expect(response.status()).toBe(401);
  });

  test("Stripe portal returns 401", async ({ request }) => {
    const response = await request.post("/api/stripe/portal");
    expect(response.status()).toBe(401);
  });

  test("admin stats returns 401", async ({ request }) => {
    const response = await request.get("/api/admin/stats");
    expect(response.status()).toBe(401);
  });

  test("admin users returns 401", async ({ request }) => {
    const response = await request.get("/api/admin/users");
    expect(response.status()).toBe(401);
  });
});

test.describe("Authentication - Security Headers", () => {
  test("public pages include security headers", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response).not.toBeNull();

    const headers = response!.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-xss-protection"]).toBe("1; mode=block");
    expect(headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  test("CSP header is present on responses", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response).not.toBeNull();

    const headers = response!.headers();
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["content-security-policy"]).toContain("default-src");
  });

  test("login page includes security headers", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response).not.toBeNull();

    const headers = response!.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
  });
});
