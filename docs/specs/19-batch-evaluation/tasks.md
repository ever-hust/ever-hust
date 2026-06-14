# Tasks: 19 — Batch Evaluation

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Extract the reusable scoring core

- [ ] T01 — Extract `evaluateJobCore` from the on-demand engine
  - **Files:** `packages/ai/src/agents/evaluate-job-core.ts` (new); reads from
    `packages/ai/src/tools/evaluate-job.ts` (#3) and uses
    `packages/ai/src/structured/index.ts` (`evaluationArtifact`, `runValidatedGeneration`,
    `assertArtifact`); upserts via `@ever-hust/db` `evaluations` table
  - **Acceptance:**
    - `evaluateJobCore({ userId, jobId, weightOverride?, includeInterviewPlan? })` returns an
      `Artifact<"evaluation">` and upserts the `evaluations` row (latest wins).
    - `userId` is a required function argument — never an LLM-supplied param.
    - Deterministic dimensions (comp/remote/level/CV-baseline) are computed without the LLM and
      marked `source: "deterministic"`.
    - Reuses the existing `evaluations_user_job_unique (userId, jobId)` upsert path.
  - **Estimate:** 1 day

- [ ] T02 — Delegate the `evaluateJob` tool to the core + export
  - **Files:** `packages/ai/src/tools/evaluate-job.ts` (edit — owned by #3);
    `packages/ai/src/index.ts` (export `evaluateJobCore`)
  - **Acceptance:**
    - The tool's `execute` calls `evaluateJobCore` and returns the same structured shape as before
      (no behaviour change for chat callers).
    - `evaluateJobCore` is exported from `@ever-hust/ai` for import by `packages/triggers`.
    - The orchestrator registration in `packages/ai/src/agents/orchestrator.ts` is unchanged.
  - **Estimate:** 0.5 day

- [ ] T03 — Unit-test `evaluateJobCore`
  - **Files:** `packages/ai/src/agents/evaluate-job-core.test.ts` (new)
  - **Acceptance:**
    - Fixture job + fixture user → deterministic dims computed without invoking the LLM.
    - Asserts the returned artifact validates against `evaluationArtifact` and the upsert is called
      with `(userId, jobId)`.
    - Runs green via `pnpm test -- --selectProjects ai`.
  - **Estimate:** 0.5 day

## Phase 2 — Cost gate + cheap pre-filter

- [ ] T04 — Implement the LLM-free score-floor pre-filter
  - **Files:** `packages/ai/src/agents/score-floor-prefilter.ts` (new);
    `packages/ai/src/index.ts` (export)
  - **Acceptance:**
    - `scoreFloorPrefilter(userId, job)` returns `{ estimate5: number, keep: boolean }` using only
      deterministic signals (comp vs target, remote fit, level fit, CV-skill overlap) — zero LLM
      calls.
    - `keep` is `false` when `estimate5` is below the effective floor (per-tier default, optional
      `users.preferences` override).
  - **Estimate:** 1 day

- [ ] T05 — Add the per-tier batch quota cost gate
  - **Files:** `packages/ai/src/rate-limit.ts` (edit — add
    `checkBatchEvaluateQuota(userId, isSubscribed)` reusing `checkRateLimit`);
    `packages/utils/src/constants.ts` (edit — free/pro batch caps);
    `packages/utils/src/index.ts` + `packages/utils/src/withCostGate.ts` (new `withCostGate` only
    if epic #6 has not landed — otherwise import from #6)
  - **Acceptance:**
    - Free vs pro batch caps are read from `users.subscriptionStatus` in (`active`,`past_due`).
    - `withCostGate(scoreFloor | quota)` skips work over quota / below floor and proceeds otherwise.
    - If #6's `withCostGate` already exists, this task imports it and adds no duplicate.
  - **Estimate:** 1 day

- [ ] T06 — Unit-test pre-filter + cost gate
  - **Files:** `packages/ai/src/agents/score-floor-prefilter.test.ts` (new);
    `packages/ai/src/rate-limit.test.ts` (edit — add quota cases)
  - **Acceptance:**
    - Below-floor job → `keep: false`; above-floor → `keep: true` (no LLM in the test).
    - Over-quota → gate skips; under-quota → gate proceeds; free vs pro caps both covered.
    - Green via `pnpm test -- --selectProjects ai`.
  - **Estimate:** 0.5 day

## Phase 3 — `batch-evaluate` Trigger.dev task + run tracking

- [ ] T07 — Add the `batch_evaluation_runs` table + push
  - **Files:** `packages/db/src/schema/batch-evaluation-runs.ts` (new);
    `packages/db/src/schema/index.ts` (edit — export); run `pnpm db:push`
  - **Acceptance:**
    - Columns follow house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`;
      `userId text → users.id (cascade)`; `status text enum [queued,running,done,failed]`;
      `jobIds jsonb $type<number[]>`; counts (`total`, `evaluated`, `skippedBelowFloor`,
      `skippedOverQuota`, `failed`) integer; `createdAt`/`updatedAt` timestamps.
    - Index `index("batch_eval_runs_user_idx").on(table.userId)`.
    - Exported from `schema/index.ts`; `pnpm db:push` applies cleanly.
  - **Estimate:** 0.5 day

- [ ] T08 — Implement `batchEvaluateTask` (pre-filter → gate → bounded fan-out → idempotent upsert)
  - **Files:** `packages/triggers/src/batch-evaluate.ts` (new);
    `packages/triggers/src/index.ts` (edit — export `batchEvaluateTask`)
  - **Acceptance:**
    - Imports `evaluateJobCore` + `scoreFloorPrefilter` from `@ever-hust/ai`.
    - Runs `scoreFloorPrefilter` then `withCostGate`; below-floor / over-quota jobs are recorded as
      skipped and never reach `evaluateJobCore`.
    - Fans out survivors with a hard concurrency cap (no unbounded `Promise.all` over the whole set).
    - Per-job `try/catch` (mirrors `sync-jobs.ts`); failures increment the run's `failed` count and
      do not abort the run.
    - Re-running the same `jobIds` updates `evaluations` in place via the existing
      `(userId, jobId)` unique — no duplicate rows.
    - Updates `batch_evaluation_runs` counts and final `status`.
    - The task performs **no** outward action (no apply/send/favorite) — only `evaluations` writes.
  - **Estimate:** 1 day

- [ ] T09 — Unit-test the batch task (concurrency, skip path, idempotency)
  - **Files:** `packages/triggers/src/batch-evaluate.test.ts` (new)
  - **Acceptance:**
    - Concurrency: with N jobs and cap C, no more than C `evaluateJobCore` calls are in-flight.
    - Skip path: a below-floor / over-quota job increments the skipped count and is never evaluated.
    - Idempotency: a second run over the same `jobIds` issues upserts (no insert of duplicates).
    - Asserts the task never calls any outward-action path.
    - Green via `pnpm test -- --selectProjects triggers`.
  - **Estimate:** 1 day

## Phase 4 — Enqueue API, progress + results UI (realtime), no auto-action

- [ ] T10 — Enqueue + progress API routes
  - **Files:** `apps/web/app/api/jobs/batch-evaluate/route.ts` (new — POST enqueue);
    `apps/web/app/api/jobs/batch-evaluate/[runId]/route.ts` (new — GET progress);
    `apps/web/lib/api-schemas.ts` (edit — batch request Zod schema)
  - **Acceptance:**
    - POST uses `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, validates body
      with the new Zod schema, triggers `batchEvaluateTask`, returns the `runId` via `apiSuccess`.
    - GET returns the `batch_evaluation_runs` row (status + counts) for the owning user only;
      `apiBadRequest`/`apiError` on bad/missing run.
    - Request schema bounds `jobIds` length (e.g. `.max(...)`) per the AI/API input-bounds rule.
  - **Estimate:** 1 day

- [ ] T11 — Canvas sync + progress/results overlay card
  - **Files:** `apps/web/hooks/use-canvas-sync.ts` (edit — add `case "batchEvaluate"`);
    `apps/web/components/canvas/batch-evaluation-card.tsx` (new — template
    `salary-insights-card.tsx`); reuse `apps/web/hooks/use-realtime-jobs.ts` /
    `packages/supabase/src/realtime.ts` for landed results
  - **Acceptance:**
    - `handleToolResult("batchEvaluate", result)` updates canvas state with run id + progress.
    - The overlay card shows queued/running/done + counts and a results summary; uses
      `@ever-hust/ui/card`/`badge` and `cn()`.
    - Evaluated jobs light up the #3 score badge/band pill on
      `apps/web/components/canvas/job-card.tsx` (no new badge component).
    - The only actions offered are view/favorite — no apply/send control is rendered.
  - **Estimate:** 1 day

- [ ] T12 — Register batch capability in the orchestrator prompt + tool surface
  - **Files:** `packages/ai/src/prompts.ts` (edit — document the batch capability + no-auto-action
    invariant; mirror to Langfuse prompt `orchestrator-system`); if a chat-callable
    `batchEvaluateJobs` tool is added, register it in `packages/ai/src/agents/orchestrator.ts`
    `tools: { ... }` with `userId` injected server-side
  - **Acceptance:**
    - The system prompt explains batch evaluation scores a set and surfaces results, and that it
      **never** applies/sends on the user's behalf.
    - If a tool is exposed, its `userId` is orchestrator-injected (never an LLM param) and it is
      added to `packages/ai/src/tools/index.ts` + the orchestrator `tools` object.
  - **Estimate:** 0.5 day

- [ ] T13 — E2E: batch-evaluate a small set, assert badges + zero auto-action
  - **Files:** `tests/e2e/batch-evaluation.spec.ts` (new)
  - **Acceptance:**
    - Seeds/uses a small synced set, enqueues a batch, waits for results.
    - Score badges/band pills appear on evaluated cards; the "evaluated"/"Best for me" view filters
      to scored jobs.
    - Asserts no application/outreach is created and no apply/send action fires (HITL preserved).
    - Runs against `http://localhost:8443` via `pnpm test:e2e`.
  - **Estimate:** 1 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
- Upstream order matters: #5 structured contract (shipped) and #3 `evaluations` table (shipped)
  are in place; #3's `evaluateJob` tool and #6's `withCostGate` are assumed — Phase 1/2 extract or
  ship-then-absorb additively if they have not landed.
