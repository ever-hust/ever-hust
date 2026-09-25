import { runJobAlerts } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";
import { cronJobAlertsSchema } from "../../../../lib/cron-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Work stops at a 240 s budget and answers non-2xx with `deferred` so the Trigger retry continues.
export const maxDuration = 300;

/**
 * POST /api/cron/job-alerts — body `{ frequencies: ("daily" | "twice_daily" | "weekly")[] }`.
 * Each alert is claimed atomically per period before sending (no duplicates on retry/re-run).
 * CRON_SECRET-guarded. Non-2xx when any alert failed or was deferred.
 */
export const POST = createCronHandler(
  "job-alerts",
  (body) => runJobAlerts(body.frequencies),
  cronJobAlertsSchema,
);
