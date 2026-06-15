import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — job alerts (#MVP)", () => {
  test("GET lists the user's alerts", async ({ request }) => {
    const res = await request.get("/api/user/alerts");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { alerts: unknown[] };
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  test("POST rejects an invalid body before any subscription check", async ({ request }) => {
    // Missing the required email — fails Zod validation (400) ahead of the Pro gate.
    const res = await request.post("/api/user/alerts", {
      data: { frequency: "daily" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST gates alert creation behind a Pro subscription", async ({ request }) => {
    // The seeded test user is free-tier, so a valid alert is forbidden (403).
    const res = await request.post("/api/user/alerts", {
      data: {
        frequency: "daily",
        email: "e2e+alerts@hust.so",
        criteria: { keywords: ["typescript"], remoteType: "remote" },
      },
    });
    expect(res.status()).toBe(403);
  });
});
