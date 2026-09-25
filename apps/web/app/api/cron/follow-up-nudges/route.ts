import { runFollowUpNudges } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Work stops at a 240 s budget and answers non-2xx with `deferred` so the Trigger retry continues.
export const maxDuration = 300;

/**
 * POST /api/cron/follow-up-nudges — daily follow-up digest. Each user is claimed atomically for the
 * 3-day cooldown before sending (no duplicates on retry/re-run). CRON_SECRET-guarded.
 * Non-2xx when any user failed or was deferred.
 */
export const POST = createCronHandler("follow-up-nudges", () => runFollowUpNudges());
