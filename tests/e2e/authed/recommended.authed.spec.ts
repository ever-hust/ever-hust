import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Authenticated — Best for me recommendations (#3)", () => {
  test("ranks the user's highest-fit evaluated job first", async ({ request }) => {
    const res = await request.get("/api/user/recommended-jobs?limit=25");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as {
      jobs: Array<{ id: number; fitScore: number | null; fitBand: string | null }>;
      total: number;
    };
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs.length).toBeGreaterThan(0);

    // auth.setup seeds a 95-score evaluation for job 2 → it must rank first.
    expect(body.jobs[0]!.id).toBe(2);
    expect(body.jobs[0]!.fitScore).toBe(95);

    // Un-evaluated jobs still appear (null fitScore), after the scored ones.
    expect(body.jobs.some((j) => j.fitScore === null)).toBe(true);
  });
});
