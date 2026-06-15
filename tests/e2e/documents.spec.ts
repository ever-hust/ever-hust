import { test, expect } from "@playwright/test";

test.describe("Document PDF export — auth", () => {
  test("pdf endpoint requires authentication", async ({ request }) => {
    const response = await request.post("/api/documents/pdf", {
      data: { title: "Cover Letter", data: { body: "Hello" } },
    });
    expect(response.status()).toBe(401);
  });
});
