import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — funnel snapshot history (#8)", () => {
  test("returns the user's funnel snapshot time series", async ({ request }) => {
    const res = await request.get("/api/user/funnel/history");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { snapshots: unknown[] };
    // Array regardless of whether the scheduled snapshot task has run for this user yet.
    expect(Array.isArray(body.snapshots)).toBe(true);
  });

  test("honours the limit bound", async ({ request }) => {
    const res = await request.get("/api/user/funnel/history?limit=5");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { snapshots: unknown[] };
    expect(body.snapshots.length).toBeLessThanOrEqual(5);
  });
});
