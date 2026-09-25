import { runBatchEvaluate } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";
import { cronBatchEvaluateSchema } from "../../../../lib/cron-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// No new LLM evaluation starts after 170 s and the run answers by 270 s (the rest come back as
// `deferred`, a still-running one as `failed`), inside the 290 s Trigger timeout.
export const maxDuration = 300;

/**
 * POST /api/cron/batch-evaluate — body `{ userId, jobIds, scoreFloor?, max? }` (the on-demand
 * Trigger `batch-evaluate` payload). CRON_SECRET-guarded: it spends LLM credit on behalf of any
 * user, so it is a machine endpoint, not a user one. 404 for an unknown user; non-2xx when any
 * evaluation failed or was deferred.
 */
export const POST = createCronHandler("batch-evaluate", (body) => runBatchEvaluate(body), cronBatchEvaluateSchema);
