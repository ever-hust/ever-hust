import { runJobAlerts } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";
import { cronJobAlertsSchema } from "../../../../lib/cron-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Work stops at a 240 s budget and answers non-2xx with `deferred` so the Trigger retry continues.
export const maxDuration = 300;

/**
 * POST /api/cron/job-alerts — body `{ frequencies: ("daily" | "twice_daily" | "weekly")[] }`.
 * Send, then advance: each send carries a Resend idempotency key derived from the alert's period
 * marker, and the marker only moves once Resend has taken the email, so a retry/re-run resends the
 * same key and Resend delivers one email. CRON_SECRET-guarded. Non-2xx when any alert failed, was
 * deferred or was left to another run's in-flight send.
 */
export const POST = createCronHandler(
  "job-alerts",
  (body) => runJobAlerts(body.frequencies),
  cronJobAlertsSchema,
);
