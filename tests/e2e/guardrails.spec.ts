import { test, expect } from "@playwright/test";

test.describe("Guardrails — structural approval gate", () => {
  test("approvals endpoint requires authentication", async ({ request }) => {
    const response = await request.post("/api/approvals", {
      data: { gateId: 1, decision: "approved" },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("Guardrails — Terms posture", () => {
  test("terms page states the human-in-the-loop / no-auto-submit posture", async ({
    page,
  }) => {
    await page.goto("/terms");
    await expect(page.getByText(/no automated submissions/i)).toBeVisible();
    await expect(page.getByText(/you own your data/i)).toBeVisible();
  });
});
