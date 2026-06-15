import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — profile", () => {
  test("GET profile returns 200 for the authenticated user", async ({ request }) => {
    const res = await request.get("/api/user/profile");
    expect(res.status()).toBe(200);
  });

  test("PATCH profile updates onboarding state", async ({ request }) => {
    const res = await request.patch("/api/user/profile", {
      data: { onboardingCompleted: true },
    });
    expect(res.status()).toBe(200);
  });
});
