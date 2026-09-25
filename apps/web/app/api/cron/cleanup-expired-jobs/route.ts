import { cleanupExpiredJobs } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";
import { cronCleanupSchema } from "../../../../lib/cron-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/cron/cleanup-expired-jobs — jobs-only cleanup (on-demand Trigger `cleanup-expired-jobs`).
 * Same reference guard and JOBS_CLEANUP_MODE as /api/cron/cleanup. CRON_SECRET-guarded.
 */
export const POST = createCronHandler(
  "cleanup-expired-jobs",
  (body) => cleanupExpiredJobs({ mode: body.mode }),
  cronCleanupSchema,
);
