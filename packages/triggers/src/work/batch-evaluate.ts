import { db as defaultDb, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { getModelForUser, runEvaluateJob, planBatchEvaluation } from "@ever-hust/ai";
import { CronInputError, CronWorkError, deadlineFrom } from "./errors";

export interface BatchEvaluatePayload {
  userId: string;
  jobIds: number[];
  scoreFloor?: number;
  max?: number;
}

export interface BatchEvaluateResult {
  evaluated: number;
  skipped: number;
  failed: { jobId: number; error: string }[];
  /** Planned but not started because the run hit its time budget. */
  deferred: number[];
  results: { jobId: number; score: number; band: string }[];
  timestamp: string;
}

export interface BatchEvaluateDeps {
  db?: typeof defaultDb;
  evaluate?: typeof runEvaluateJob;
  resolveModel?: typeof getModelForUser;
  deadline?: number;
  budgetMs?: number;
  clock?: () => number;
}

/**
 * Background batch evaluation (spec #19). Fans out the keystone `runEvaluateJob` (#3) over a
 * candidate set, cost-gated via `planBatchEvaluation` (#6). Each result upserts an `evaluations`
 * row (unique per user+job), so the canvas/funnel pick them up.
 *
 * Unknown user → {@link CronInputError} (404). Any failed or deferred job →
 * {@link CronWorkError} carrying the full result, so the caller sees a non-2xx. The Trigger task
 * does not retry (each evaluation is a paid LLM call); re-trigger with the `failed`/`deferred` ids.
 */
export async function runBatchEvaluate(
  payload: BatchEvaluatePayload,
  deps: BatchEvaluateDeps = {},
): Promise<BatchEvaluateResult> {
  const database = deps.db ?? defaultDb;
  const evaluate = deps.evaluate ?? runEvaluateJob;
  const resolveModel = deps.resolveModel ?? getModelForUser;
  const clock = deps.clock ?? Date.now;
  const deadline = deps.deadline ?? deadlineFrom(clock(), deps.budgetMs);
  const { userId, jobIds, scoreFloor, max = 50 } = payload;

  const rows = await database
    .select({ preferences: users.preferences, subscriptionStatus: users.subscriptionStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) throw new CronInputError("User not found.", 404);

  const model = resolveModel(user as Parameters<typeof getModelForUser>[0]);

  // Cost-gate + cap (score is unknown pre-evaluation, so the floor mainly applies on re-runs).
  const plan = planBatchEvaluation(
    jobIds.map((jobId) => ({ jobId })),
    { scoreFloor, max },
  );

  const results: BatchEvaluateResult["results"] = [];
  const failed: BatchEvaluateResult["failed"] = [];
  const deferred: number[] = [];
  for (const jobId of plan.toEvaluate) {
    if (clock() > deadline) {
      deferred.push(jobId);
      continue;
    }
    try {
      const r = await evaluate({ jobId, userId, model });
      if (r.evaluated) results.push({ jobId: r.jobId, score: r.score, band: r.band });
      else failed.push({ jobId, error: r.error });
    } catch (err) {
      failed.push({ jobId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  results.sort((a, b) => b.score - a.score);

  const result: BatchEvaluateResult = {
    evaluated: results.length,
    skipped: plan.skipped.length,
    failed,
    deferred,
    results,
    timestamp: new Date(clock()).toISOString(),
  };
  if (failed.length > 0 || deferred.length > 0) {
    throw new CronWorkError(
      `Batch evaluation incomplete: ${failed.length} failed, ${deferred.length} deferred (evaluated ${results.length}).`,
      result,
    );
  }
  return result;
}
