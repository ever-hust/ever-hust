import { test, expect } from "@playwright/test";

/**
 * Corpus signals end-to-end (spec #4 liveness / #7 legitimacy).
 *
 * Verifies the full consumption loop wired in Hust: the Ever Jobs corpus signals
 * are persisted on the jobs table, selected by the public read endpoints, and
 * therefore reach the canvas/detail surfaces that render the freshness + posting
 * legitimacy badges. Public endpoints — no auth required.
 */

const LIVENESS_STATES = new Set(["active", "expired", "uncertain", null]);
const LEGITIMACY_STATES = new Set(["verified", "likely", "uncertain", null]);

test.describe("Corpus signals — liveness & legitimacy", () => {
  test("search results carry liveness + legitimacy fields", async ({ request }) => {
    const res = await request.get("/api/jobs/search?limit=100");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as {
      jobs: Array<{
        id: number;
        liveness: string | null;
        legitimacy: string | null;
      }>;
    };
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs.length).toBeGreaterThan(0);

    for (const job of body.jobs) {
      // The columns are always selected, even when null (forward-compatible).
      expect(job).toHaveProperty("liveness");
      expect(job).toHaveProperty("legitimacy");
      expect(LIVENESS_STATES.has(job.liveness)).toBe(true);
      expect(LEGITIMACY_STATES.has(job.legitimacy)).toBe(true);
    }

    // The seeded corpus populates the signals, so at least one of each must be present.
    expect(body.jobs.some((j) => j.liveness != null)).toBe(true);
    expect(body.jobs.some((j) => j.legitimacy != null)).toBe(true);
  });

  test("job detail exposes the signal triple including reasons", async ({ request }) => {
    const list = await request.get("/api/jobs/search?limit=1");
    expect(list.status()).toBe(200);
    const firstId = ((await list.json()) as { jobs: Array<{ id: number }> }).jobs[0]?.id;
    expect(firstId).toBeTruthy();

    const res = await request.get(`/api/jobs/${firstId}`);
    expect(res.status()).toBe(200);
    const { job } = (await res.json()) as {
      job: {
        liveness: string | null;
        legitimacy: string | null;
        legitimacyReasons: string[] | null;
      };
    };
    expect(job).toHaveProperty("liveness");
    expect(job).toHaveProperty("legitimacy");
    expect(job).toHaveProperty("legitimacyReasons");
    // Reasons are either a string array or null — never undefined.
    expect(job.legitimacyReasons === null || Array.isArray(job.legitimacyReasons)).toBe(true);
  });
});
