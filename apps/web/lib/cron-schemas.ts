import { z } from "zod";

/** Body of `POST /api/cron/cleanup` and `/api/cron/cleanup-expired-jobs`. */
export const cronCleanupSchema = z
  .object({
    // Can only make a run SAFER than JOBS_CLEANUP_MODE; "delete" is deliberately not accepted.
    mode: z.enum(["dry-run", "off"]).optional(),
  })
  .strict();

/** Body of `POST /api/cron/job-alerts`. */
export const cronJobAlertsSchema = z
  .object({
    frequencies: z.array(z.enum(["daily", "twice_daily", "weekly"])).min(1).max(3),
  })
  .strict();

/** Body of `POST /api/cron/batch-evaluate` (same payload as the `batch-evaluate` task). */
export const cronBatchEvaluateSchema = z
  .object({
    userId: z.string().trim().min(1).max(200),
    jobIds: z.array(z.number().int().positive()).min(1).max(200),
    scoreFloor: z.number().min(0).max(100).optional(),
    max: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export type CronCleanupBody = z.infer<typeof cronCleanupSchema>;
export type CronJobAlertsBody = z.infer<typeof cronJobAlertsSchema>;
export type CronBatchEvaluateBody = z.infer<typeof cronBatchEvaluateSchema>;
