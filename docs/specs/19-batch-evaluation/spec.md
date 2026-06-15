# Spec #19 — Batch Evaluation

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: M–L · Phase 4 · Depends on: [#3](../03-evaluation-engine/spec.md) + cost gating ([#6](../06-guardrails/spec.md))

## 1. Problem & user value

Power users and (later) teams want many jobs scored without clicking each. Batch evaluation fans
out [#3](../03-evaluation-engine/spec.md) across a result set in the background, **cost-gated** so
expensive work only runs where it's worth it.

## 2. Scope

**In:** background fan-out of `evaluateJob` over a saved search / candidate set via Trigger.dev;
**cost gating** (only fully evaluate above a score floor / within quota); progress + results
surfaced when ready. **Out:** auto-applying to the batch (that's [#19a](../19a-apply-copilot/spec.md), HITL).

## 3. Design

- A Trigger.dev task `batch-evaluate` fans out `evaluateJob` with bounded concurrency; writes
  `evaluations` rows; respects per-tier quota + a **score-floor pre-filter** (cheap heuristic before
  the full LLM evaluation) via #6's `withCostGate`.
- Results stream to the canvas (realtime) / an "evaluated" view; never auto-acts.

## 4. Plan & tasks

1. `batch-evaluate` Trigger.dev task (bounded concurrency, idempotent upserts).
2. Cheap pre-filter + `withCostGate` (score floor / quota).
3. Progress + results UI (realtime).
4. Tests: fan-out caps, cost-gate skip path, idempotent re-run.

## 5. Acceptance

- A user batch-evaluates a result set; expensive evaluation is skipped below the floor / over quota;
  results appear without any auto-action; CI green; **zero competitor references**.

## Implementation (shipped)

- **Planner (pure, cost-gated):** `packages/ai/src/evaluation/batch.ts` — `planBatchEvaluation()`
  decides which candidates to fully evaluate, applying a score-floor pre-filter and a hard cap;
  returns `{ toEvaluate, skipped }`. Unit-tested in `packages/ai/src/evaluation/batch.test.ts`.
- **Cost gate (reuses #6):** `packages/ai/src/policy/cost-gate.ts` (`evaluateCostGate` /
  `withCostGate`) + caps in `packages/ai/src/policy/limits.ts` (`BATCH_EVAL_MAX_CONCURRENCY = 5`,
  `DEFAULT_SCORE_FLOOR = 60`).
- **AI tool:** `packages/ai/src/tools/batch-evaluate.ts` — `batchEvaluateTool` evaluates a bounded
  set inline and ranks by fit (best first); registered in the orchestrator as the **`batchEvaluate`**
  tool (`packages/ai/src/agents/orchestrator.ts`). Tested in `packages/ai/src/tools/batch-evaluate.test.ts`.
- **Background fan-out:** `packages/triggers/src/batch-evaluate.ts` — Trigger.dev task id
  **`batch-evaluate`** fans out the keystone `runEvaluateJob` (#3) over a candidate set,
  cost-gated via `planBatchEvaluation`; exported from `packages/triggers/src/index.ts`.
- **Persistence:** each evaluation upserts an `evaluations` row (`packages/db/src/schema/evaluations.ts`,
  unique on `(userId, jobId)`) via `runEvaluateJob`'s `onConflictDoUpdate` — so re-runs are idempotent.
- **Surfacing:** results land in the `evaluations` table and flow to the existing evaluation /
  pipeline-funnel views (#3); the dedicated chat tool also returns ranked results inline.
- **Public API:** `planBatchEvaluation`, `BatchPlan`, `BatchCandidate`, and `batchEvaluateTool`
  are exported from the package barrel `packages/ai/src/index.ts`.
- **Deferred:** a dedicated batch-evaluation **API route** and a standalone realtime "evaluated
  view" progress UI component were not built — batch evaluation is surfaced through the chat
  orchestrator tool + the background task, with results rendered by the existing evaluations UI.
