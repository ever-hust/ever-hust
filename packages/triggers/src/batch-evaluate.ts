import { task } from "@trigger.dev/sdk";
import { callAppEndpoint } from "./app-endpoint";
import { APP_ENDPOINT_TASK_MAX_DURATION_S, CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";

export interface BatchEvaluateTaskPayload {
  userId: string;
  jobIds: number[];
  scoreFloor?: number;
  max?: number;
}

/**
 * Background batch-evaluation task (spec #19), triggered on demand with a
 * { userId, jobIds, scoreFloor?, max? } payload. The work (DB + LLM keys) runs in the app via
 * `POST /api/cron/batch-evaluate` (see `work/batch-evaluate.ts`).
 *
 * `maxAttempts: 1`: every evaluation is a paid LLM call and a timed-out request keeps running in
 * the app, so an automatic retry could pay twice. A FAILED run lists `failed`/`deferred` job ids
 * in its error; re-trigger with those.
 */
export const batchEvaluateTask = task({
  id: "batch-evaluate",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  retry: { maxAttempts: 1 },
  run: async (payload: BatchEvaluateTaskPayload) =>
    callAppEndpoint(CRON_ENDPOINTS.batchEvaluate, payload, { timeoutMs: CRON_TIMEOUTS_MS.batchEvaluate }),
});
