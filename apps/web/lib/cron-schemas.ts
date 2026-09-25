import { alertWindowEndProblem } from "@ever-hust/triggers/work";
import { z } from "zod";

/** Body of `POST /api/cron/cleanup` and `/api/cron/cleanup-expired-jobs`. */
export const cronCleanupSchema = z
  .object({
    // Can only make a run SAFER than JOBS_CLEANUP_MODE; "delete" is deliberately not accepted.
    mode: z.enum(["dry-run", "off"]).optional(),
  })
  .strict();

/**
 * Body of `POST /api/cron/job-alerts`. `windowEnd` (ISO 8601 with an offset, e.g. `...Z`) is the
 * run's fixed window end: the Trigger task sends the schedule's fire time, or the run's creation
 * time for an on-demand run, identical on every attempt. Absent → the app's current time. More than
 * 5 min in the future or more than 8 days old → 400 (`alertWindowEndProblem`).
 */
export const cronJobAlertsSchema = z
  .object({
    frequencies: z.array(z.enum(["daily", "twice_daily", "weekly"])).min(1).max(3),
    windowEnd: z
      .string()
      .datetime({ offset: true })
      .superRefine((value, ctx) => {
        const problem = alertWindowEndProblem(new Date(value), new Date());
        if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
      })
      .optional(),
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
