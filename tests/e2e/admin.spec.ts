import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Admin Area — Smoke Tests
// ---------------------------------------------------------------------------
// The admin layout (apps/web/app/(admin)/layout.tsx) performs two checks:
//  1. Unauthenticated users are redirected to /login?callbackUrl=/admin
//  2. Authenticated non-admin users are redirected to /chat
//
// Since we don't have authenticated admin sessions in our test environment,
// these tests focus on verifying the auth redirect behavior is correct
// for all admin routes and testing the admin API endpoints return 401.
// ---------------------------------------------------------------------------

test.describe("Admin Dashboard - Auth Redirect", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("preserves callback URL for admin dashboard", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/admin");
  });

  test("login page shows sign-in option when redirected from admin", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });
});

test.describe("Admin Sub-Pages - Auth Redirect", () => {
  const adminPages = [
    { path: "/admin/users", name: "Users" },
    { path: "/admin/jobs", name: "Jobs" },
    { path: "/admin/analytics", name: "Analytics" },
    { path: "/admin/branding", name: "Branding" },
    { path: "/admin/ai-config", name: "AI Config" },
  ];

  for (const { path, name } of adminPages) {
    test(`${name} page (/admin/${name.toLowerCase().replace(/ /g, "-")}) requires authentication`, async ({
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

// ---------------------------------------------------------------------------
// Admin API Endpoints — Authentication Required
// ---------------------------------------------------------------------------

test.describe("Admin API - Authentication", () => {
  test("admin stats endpoint requires authentication", async ({ request }) => {
    const response = await request.get("/api/admin/stats");
    expect(response.status()).toBe(401);
  });

  test("admin users endpoint requires authentication", async ({ request }) => {
    const response = await request.get("/api/admin/users?page=1&limit=10");
    expect(response.status()).toBe(401);
  });

  test("admin user role change requires authentication", async ({
    request,
  }) => {
    const response = await request.patch("/api/admin/users/fake-id/role", {
      data: { role: "admin" },
    });
    expect(response.status()).toBe(401);
  });

  test("admin jobs endpoint requires authentication", async ({ request }) => {
    const response = await request.get("/api/admin/jobs?page=1&limit=10");
    expect(response.status()).toBe(401);
  });

  test("admin analytics overview endpoint requires authentication", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/analytics/overview");
    expect(response.status()).toBe(401);
  });

  test("admin analytics user-growth endpoint requires authentication", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/analytics/user-growth");
    expect(response.status()).toBe(401);
  });

  test("admin branding endpoint requires authentication", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/branding");
    expect(response.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Admin Route Protection — Verify no admin content leaks
// ---------------------------------------------------------------------------

test.describe("Admin Route Protection", () => {
  test("admin routes do not expose admin content to unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/);

    // Should NOT see admin-specific content
    const adminDashboard = page.getByText("Admin Dashboard");
    await expect(adminDashboard).not.toBeVisible();
  });

  test("admin users page does not expose user data to unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await page.waitForURL(/\/login/);

    // Should NOT see user management content
    const userManagement = page.getByText("User Management");
    await expect(userManagement).not.toBeVisible();
  });

  test("admin jobs page does not expose job data to unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/admin/jobs");
    await page.waitForURL(/\/login/);

    // Should NOT see job management content
    const jobsManagement = page.getByText("Jobs Management");
    await expect(jobsManagement).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Dashboard redirect — /dashboard -> /chat
// ---------------------------------------------------------------------------

test.describe("Dashboard Redirect", () => {
  test("/dashboard redirects to /chat (which requires auth)", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // Middleware redirects /dashboard -> /chat, then /chat -> /login
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });
});
