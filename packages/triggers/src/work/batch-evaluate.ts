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
 * At this point (ms after the run started) an evaluation that is still running is ABORTED: its LLM
 * call is cancelled through an `AbortSignal` (see `runEvaluateJob`), and the run answers with it
 * in `interrupted` and the rest in `deferred`. The Trigger run (`maxAttempts: 1`, 290 s timeout)
 * therefore gets the lists instead of a bare "timed out".
 */
export const BATCH_EVALUATE_RESPONSE_LIMIT_MS = 270_000;

/**
 * After the abort, how long the run waits for the evaluation to settle, so it can report whether
 * the call really stopped (`aborted`) or is still running (`in_progress`). 270 s + 5 s stays inside
 * the 290 s Trigger timeout.
 */
export const BATCH_EVALUATE_ABORT_GRACE_MS = 5_000;

export interface BatchEvaluatePayload {
  userId: string;
  jobIds: number[];
  scoreFloor?: number;
  max?: number;
}

/**
 * An evaluation that was still running at the response limit. Never in `retryJobIds`:
 *  - `aborted`: the LLM call was cancelled and no result was saved, but the provider may already
 *    have billed the tokens it produced. Re-trigger it only if you still want it.
 *  - `in_progress`: it did not stop within the grace period (for example it was already saving),
 *    so it may still save its result. Check for its evaluation before re-triggering it.
 */
export interface InterruptedEvaluation {
  jobId: number;
  status: "aborted" | "in_progress";
}

export interface BatchEvaluateResult {
  evaluated: number;
  skipped: number;
  /** Finished without a result (error or evaluation failure); nothing is still running for them. */
  failed: { jobId: number; error: string }[];
  /** Cancelled or still running at the response limit (see {@link InterruptedEvaluation}). */
  interrupted: InterruptedEvaluation[];
  /** Planned but not started because the run hit its time budget. */
  deferred: number[];
  /** Safe to re-trigger: the `failed` and `deferred` job ids, never the `interrupted` ones. */
  retryJobIds: number[];
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
  /** Wait after the abort (default {@link BATCH_EVALUATE_ABORT_GRACE_MS}). */
  abortGraceMs?: number;
  clock?: () => number;
}

type Settled<T> = { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown } | { status: "pending" };

/** How `promise` stands after at most `ms`. Never rejects; the promise itself keeps running. */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Settled<T>>((resolve) => {
    timer = setTimeout(() => resolve({ status: "pending" }), Math.max(0, ms));
  });
  // Handling both outcomes here also means a late rejection never becomes an unhandled rejection.
  const settled = promise.then(
    (value): Settled<T> => ({ status: "fulfilled", value }),
    (reason: unknown): Settled<T> => ({ status: "rejected", reason }),
  );
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Background batch evaluation (spec #19). Fans out the keystone `runEvaluateJob` (#3) over a
 * candidate set, cost-gated via `planBatchEvaluation` (#6). Each result upserts an `evaluations`
 * row (unique per user+job), so the canvas/funnel pick them up.
 *
 * Unknown user → {@link CronInputError} (404). Any failed, interrupted or deferred job →
 * {@link CronWorkError} carrying the full result, so the caller sees a non-2xx. The Trigger task
 * does not retry (each evaluation is a paid LLM call); re-trigger with `retryJobIds` (the `failed`
 * and `deferred` ids). The `interrupted` ones are never in that list.
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
  const abortGraceMs = deps.abortGraceMs ?? BATCH_EVALUATE_ABORT_GRACE_MS;
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
  const interrupted: InterruptedEvaluation[] = [];
  const deferred: number[] = [];
  let outOfTime = false;
  for (const jobId of plan.toEvaluate) {
    if (outOfTime || clock() > deadline) {
      deferred.push(jobId);
      continue;
    }
    const controller = new AbortController();
    const running = (async () => evaluate({ jobId, userId, model, abortSignal: controller.signal }))();
    let outcome = await settleWithin(running, answerBy - clock());
    if (outcome.status === "pending") {
      // Response limit: cancel the paid call, then give it a moment to settle so the report says
      // whether it really stopped.
      outOfTime = true;
      controller.abort(new Error("batch-evaluate response limit reached"));
      outcome = await settleWithin(running, abortGraceMs);
      if (outcome.status === "pending") {
        interrupted.push({ jobId, status: "in_progress" });
        continue;
      }
      if (outcome.status === "rejected") {
        interrupted.push({ jobId, status: "aborted" });
        continue;
      }
      // Fulfilled during the grace period: it finished after all, so it is reported like any other.
    }
    if (outcome.status === "rejected") {
      failed.push({ jobId, error: errorMessage(outcome.reason) });
    } else if (outcome.value.evaluated) {
      results.push({ jobId: outcome.value.jobId, score: outcome.value.score, band: outcome.value.band });
    } else {
      failed.push({ jobId, error: outcome.value.error });
    }
  }
  results.sort((a, b) => b.score - a.score);

  const result: BatchEvaluateResult = {
    evaluated: results.length,
    skipped: plan.skipped.length,
    failed,
    interrupted,
    deferred,
    retryJobIds: [...failed.map((f) => f.jobId), ...deferred],
    results,
    timestamp: new Date(clock()).toISOString(),
  };
  if (failed.length > 0 || interrupted.length > 0 || deferred.length > 0) {
    const interruptedNote =
      interrupted.length > 0
        ? " Interrupted jobs are not in retryJobIds: each may already have been billed, and an in_progress one may still save its result, so check for its evaluation before re-triggering it."
        : "";
    throw new CronWorkError(
      `Batch evaluation incomplete: ${failed.length} failed, ${interrupted.length} interrupted, ` +
        `${deferred.length} deferred (evaluated ${results.length}). Re-trigger with retryJobIds.${interruptedNote}`,
      result,
    );
  }
  return result;
}
