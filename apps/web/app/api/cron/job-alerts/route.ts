import { runJobAlerts } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";
import { cronJobAlertsSchema } from "../../../../lib/cron-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Work stops at a 240 s budget and answers non-2xx with `deferred` so the Trigger retry continues.
export const maxDuration = 300;

/**
 * POST /api/cron/job-alerts — body `{ frequencies: ("daily" | "twice_daily" | "weekly")[],
 * windowEnd?: string }`. `windowEnd` fixes the end of every period the run sends; the Trigger task
 * passes a value that is the same on every attempt of a run (absent → now). Send, then advance:
 * each send carries a Resend idempotency key derived from the alert's marker and the window end,
 * and the marker only moves (to the window end) once Resend has taken the email, so a retry repeats
 * the same email under the same key and Resend delivers one. CRON_SECRET-guarded. 400 for an
 * unusable `windowEnd`. Non-2xx when any alert failed, was deferred or was left to another run's
 * in-flight send.
 */
export const POST = createCronHandler(
  "job-alerts",
  (body) => runJobAlerts(body.frequencies, { windowEnd: body.windowEnd }),
  cronJobAlertsSchema,
);
