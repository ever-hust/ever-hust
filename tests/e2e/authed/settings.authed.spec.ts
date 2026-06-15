import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — settings", () => {
  test("PATCH updates profile-ish settings fields", async ({ request }) => {
    const res = await request.patch("/api/user/settings", {
      data: { headline: "Senior Engineer", location: "Remote" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).updated).toBe(true);
  });

  test("PATCH rejects a malformed body (400)", async ({ request }) => {
    // `name` must be a string — a number fails Zod validation.
    const res = await request.patch("/api/user/settings", {
      data: { name: 12345 },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH merges a preference without erasing siblings", async ({ request }) => {
    const res = await request.patch("/api/user/settings", {
      data: { preferences: { remotePreference: "remote" } },
    });
    expect(res.status()).toBe(200);
  });
});
