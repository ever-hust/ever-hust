import { task } from "@trigger.dev/sdk";
import { db, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import {
  getModelForUser,
  runEvaluateJob,
  planBatchEvaluation,
} from "@ever-hust/ai";

/**
 * Background batch-evaluation task (spec #19). Fans out the keystone `runEvaluateJob` (#3) over a
 * candidate set without blocking the chat, cost-gated via `planBatchEvaluation` (#6). Each result
 * upserts an `evaluations` row, so the canvas/funnel pick them up. Triggered on-demand with a
 * { userId, jobIds, scoreFloor? } payload.
 */
export const batchEvaluateTask = task({
  id: "batch-evaluate",
  run: async (payload: {
    userId: string;
    jobIds: number[];
    scoreFloor?: number;
    max?: number;
  }) => {
    const { userId, jobIds, scoreFloor, max = 50 } = payload;

    const rows = await db
      .select({
        preferences: users.preferences,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = rows[0];
    if (!user) return { evaluated: 0, skipped: 0, error: "User not found." };

    const model = getModelForUser(user as Parameters<typeof getModelForUser>[0]);

    // Cost-gate + cap (score is unknown pre-evaluation, so the floor mainly applies on re-runs).
    const plan = planBatchEvaluation(
      jobIds.map((jobId) => ({ jobId })),
      { scoreFloor, max },
    );

    const results: { jobId: number; score: number; band: string }[] = [];
    const failed: { jobId: number; error: string }[] = [];
    for (const jobId of plan.toEvaluate) {
      const r = await runEvaluateJob({ jobId, userId, model });
      if (r.evaluated) {
        results.push({ jobId: r.jobId, score: r.score, band: r.band });
      } else {
        failed.push({ jobId, error: r.error });
      }
    }
    results.sort((a, b) => b.score - a.score);

    return {
      evaluated: results.length,
      skipped: plan.skipped.length,
      failed,
      results,
      timestamp: new Date().toISOString(),
    };
  },
});
