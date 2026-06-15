import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — account & usage", () => {
  test("GET usage returns the plan + per-feature counters", async ({ request }) => {
    const res = await request.get("/api/user/usage");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      plan: string;
      usage: { messages: { limit: number }; searches: unknown };
    };
    expect(body.plan).toBeTruthy();
    expect(body.usage).toHaveProperty("messages");
    expect(body.usage).toHaveProperty("searches");
  });

  test("GET applications lists the user's pipeline", async ({ request }) => {
    const res = await request.get("/api/user/applications");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { applications: unknown[]; total: number };
    expect(Array.isArray(body.applications)).toBe(true);
    // auth.setup seeds at least two applications for this user.
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  test("GET applications validates the status filter", async ({ request }) => {
    const res = await request.get("/api/user/applications?status=not-a-status");
    expect(res.status()).toBe(400);
  });

  test("GET export returns a downloadable JSON snapshot of the account", async ({ request }) => {
    const res = await request.get("/api/user/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("attachment");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("exportDate");
    expect(body).toHaveProperty("profile");
    expect(body).toHaveProperty("applications");
  });
});
