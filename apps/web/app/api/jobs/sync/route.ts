import { handleJobsSync } from "../../../../lib/jobs-sync-route";

// Long-running, streamed, never cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/jobs/sync
 *
 * Populates the local `jobs` table from the Ever Jobs API (spec 01a). Called by the Trigger.dev
 * schedules (`mode: "keywords"` every 15 min, `mode: "full"` every 6 h) or any external scheduler.
 *
 * Optional body: `{ mode?: "keywords" | "full", searchTerms?: string[], resultsWanted?: number,
 * siteCategories?: string[], deadlineMs?: number }` — `resultsWanted` is per source (1..1000);
 * `searchTerms` / `siteCategories` are keywords-mode only; `deadlineMs` is the caller's budget
 * (default and max 2 h).
 *
 * Returns non-2xx if it fails before streaming, otherwise an NDJSON progress stream that ends
 * with one `{"type":"summary","ok":…}` line. See `apps/web/lib/jobs-sync-route.ts`.
 */
export async function POST(req: Request) {
  return handleJobsSync(req);
}
