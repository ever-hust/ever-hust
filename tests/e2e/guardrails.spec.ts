import { test, expect } from "@playwright/test";

test.describe("Guardrails — structural approval gate", () => {
  test("approvals endpoint requires authentication", async ({ request }) => {
    const response = await request.post("/api/approvals", {
      data: { gateId: 1, decision: "approved" },
    });
    expect(response.status()).toBe(401);
  });
});

// The Terms-of-Service posture (human-in-the-loop / no auto-submit) now lives on
// the marketing site (hust.so/tos); its content test belongs with the website.
