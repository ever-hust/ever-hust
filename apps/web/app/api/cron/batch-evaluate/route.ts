import { runBatchEvaluate } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";
import { cronBatchEvaluateSchema } from "../../../../lib/cron-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// No new LLM evaluation starts after 170 s; at 270 s a still-running one is aborted and reported
// as `interrupted`, the rest as `deferred`; the run answers by 275 s, inside the 290 s Trigger
// timeout.
export const maxDuration = 300;

/**
 * POST /api/cron/batch-evaluate — body `{ userId, jobIds, scoreFloor?, max? }` (the on-demand
 * Trigger `batch-evaluate` payload). CRON_SECRET-guarded: it spends LLM credit on behalf of any
 * user, so it is a machine endpoint, not a user one. 404 for an unknown user; non-2xx when any
 * evaluation failed, was interrupted or was deferred (`retryJobIds` lists the safe re-runs).
 */
export const POST = createCronHandler("batch-evaluate", (body) => runBatchEvaluate(body), cronBatchEvaluateSchema);
