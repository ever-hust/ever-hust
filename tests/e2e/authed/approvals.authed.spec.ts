import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — approval gate (#6)", () => {
  test("deciding a non-existent gate returns 404 (authenticated, not 401)", async ({
    request,
  }) => {
    const res = await request.post("/api/approvals", {
      data: { gateId: 999999, decision: "approved" },
    });
    expect(res.status()).not.toBe(401);
    expect(res.status()).toBe(404);
  });

  test("rejects an invalid decision (400)", async ({ request }) => {
    const res = await request.post("/api/approvals", {
      data: { gateId: 1, decision: "maybe" },
    });
    expect(res.status()).toBe(400);
  });
});
