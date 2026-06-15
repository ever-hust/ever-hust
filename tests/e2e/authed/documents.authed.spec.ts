import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — document PDF export (#10/#11)", () => {
  test("renders an artifact to a real PDF", async ({ request }) => {
    const res = await request.post("/api/documents/pdf", {
      data: {
        title: "Cover Letter",
        subtitle: "Acme · Senior Backend Engineer",
        data: {
          greeting: "Dear Hiring Team,",
          body: "I bring six years of backend experience building reliable payment services.",
          closing: "Best regards, Jordan",
          highlightedSkills: ["Go", "Payments", "Reliability"],
        },
      },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    const buf = await res.body();
    // A valid PDF starts with the %PDF- magic bytes.
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(500);
  });

  test("rejects an invalid payload (400)", async ({ request }) => {
    const res = await request.post("/api/documents/pdf", {
      data: { subtitle: "missing title + data" },
    });
    expect(res.status()).toBe(400);
  });
});
