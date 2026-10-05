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

    // auth.setup seeds a 95-score evaluation for job 2. The real-LLM spec (same user) may also
    // persist a live-scored evaluation for job 1, so assert the ranking, not a fixed winner:
    // scored jobs come first, highest score first, and job 2 is among them with 95.
    const scores = body.jobs.map((j) => j.fitScore);
    const firstUnscored = scores.indexOf(null);
    const scored = (firstUnscored === -1 ? scores : scores.slice(0, firstUnscored)) as number[];
    expect(scored.length).toBeGreaterThan(0);
    expect(scored).toEqual([...scored].sort((a, b) => b - a));
    expect(body.jobs.find((j) => j.id === 2)?.fitScore).toBe(95);

    // Un-evaluated jobs still appear (null fitScore), after the scored ones.
    expect(firstUnscored).toBeGreaterThan(-1);
    expect(scores.slice(firstUnscored).every((s) => s === null)).toBe(true);
  });
});
