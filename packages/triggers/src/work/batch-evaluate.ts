import { db as defaultDb, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { getModelForUser, runEvaluateJob, planBatchEvaluation } from "@ever-hust/ai";
import { CronInputError, CronWorkError, deadlineFrom } from "./errors";

/**
 * No NEW evaluation starts after this much of the run (ms). Lower than the default 240 s budget:
 * one LLM evaluation has no timeout of its own (up to 2 validation attempts x 3 SDK tries), so the
 * last one started needs room to finish before the ~290 s Trigger timeout.
 */
export const BATCH_EVALUATE_BUDGET_MS = 170_000;

/**
 * The run answers by this point (ms after it started) even if an evaluation is still running:
 * that evaluation is reported as failed ("still running") and the rest as deferred, so the Trigger
 * run (`maxAttempts: 1`, 290 s timeout) gets the list instead of a bare "timed out". The
 * evaluation itself keeps running in the app and may still save its result.
 */
export const BATCH_EVALUATE_RESPONSE_LIMIT_MS = 270_000;

export const STILL_RUNNING_ERROR =
  "Still running when the run had to answer; its result may still be saved. Re-trigger only if it is missing.";

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
  /** Absolute deadline (epoch ms) after which no new evaluation starts. */
  deadline?: number;
  /** Relative form of `deadline` (default {@link BATCH_EVALUATE_BUDGET_MS}). */
  budgetMs?: number;
  /** Relative hard limit for answering (default {@link BATCH_EVALUATE_RESPONSE_LIMIT_MS}). */
  responseLimitMs?: number;
  clock?: () => number;
}

const TIMED_OUT = Symbol("timed-out");

/** Resolve with the promise's value, or with {@link TIMED_OUT} after `ms` (the promise keeps running). */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), Math.max(0, ms));
  });
  // A late rejection of the abandoned evaluation must not become an unhandled rejection.
  promise.catch(() => undefined);
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
  const started = clock();
  const deadline = deps.deadline ?? deadlineFrom(started, deps.budgetMs ?? BATCH_EVALUATE_BUDGET_MS);
  const answerBy = started + (deps.responseLimitMs ?? BATCH_EVALUATE_RESPONSE_LIMIT_MS);
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
  let outOfTime = false;
  for (const jobId of plan.toEvaluate) {
    if (outOfTime || clock() > deadline) {
      deferred.push(jobId);
      continue;
    }
    try {
      const r = await settleWithin(evaluate({ jobId, userId, model }), answerBy - clock());
      if (r === TIMED_OUT) {
        failed.push({ jobId, error: STILL_RUNNING_ERROR });
        outOfTime = true;
      } else if (r.evaluated) results.push({ jobId: r.jobId, score: r.score, band: r.band });
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
