# Plan: 19 — Batch Evaluation

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

Batch Evaluation turns the on-demand, per-job scoring engine (epic #3) into a background
fan-out that can score a whole result set or candidate set without the user clicking each job.
The brand posture is **quality over quantity** and **human-in-the-loop**: the batch *scores*
and *surfaces*, it never applies, sends, or otherwise acts. Cost is the central constraint —
fully evaluating every job with the LLM is expensive, so a cheap deterministic pre-filter and a
per-tier cost gate (epic #6) decide which jobs are worth the full evaluation.

The unit of work is one `(userId, jobId)` evaluation that produces an `Artifact<"evaluation">`
(epic #5) and upserts an `evaluations` row (already shipped by #3's data work). To reuse that
logic from a background worker we must first **extract the scoring core**: epic #3 packages the
engine as an orchestrator tool (`evaluateJob`) whose `userId` is injected server-side and whose
`execute` returns a structured object. A Trigger.dev task cannot call that tool's `execute`
through the orchestrator. So Phase 1 lifts the engine body into a plain async function —
`evaluateJobCore({ userId, jobId, ... })` in `packages/ai/src/agents/` — that both the existing
`evaluateJob` tool and the new batch task call. This is additive: the tool keeps working
unchanged, it just delegates.

Phase 2 builds the **cost discipline** that makes batch viable. A cheap, LLM-free
`scoreFloorPrefilter(userId, job)` computes the deterministic dimensions the engine already
knows how to compute server-side (comp vs target, remote fit, level fit, CV-skill overlap —
the same determinism boundary #3 defines) and produces a rough 1–5 estimate. Jobs below the
user's score floor are recorded as `skipped_below_floor` and never reach the LLM. Above the
floor, the run passes through `withCostGate` (epic #6) which enforces the per-tier quota
(`users.subscriptionStatus` in `active`/`past_due` → pro caps; otherwise free caps) using the
existing Upstash limiter plumbing in `packages/ai/src/rate-limit.ts`.

Phase 3 is the **Trigger.dev fan-out task** `batch-evaluate`. It takes a set of job ids (from a
saved search / a candidate set / an explicit list), runs the pre-filter, then fans out the
survivors to `evaluateJobCore` with **bounded concurrency** so we never stampede the model
provider or the DB. Writes are **idempotent upserts** keyed on the existing
`evaluations_user_job_unique (userId, jobId)` constraint, so a re-run of the same batch updates
in place rather than duplicating. A small `batch_evaluation_runs` table tracks run lifecycle
(queued → running → done/failed) and per-job outcome counts so progress can be polled and
surfaced.

Phase 4 surfaces **progress + results without auto-action**. A new API route enqueues a run and
a second route (or the run row) reports progress; the canvas gets a `case "batchEvaluate"` in
`use-canvas-sync.ts` plus a progress/results overlay card modeled on
`salary-insights-card.tsx`. New evaluations already in the DB light up the existing score badge
+ band pill that #3 renders on `job-card.tsx`; a "Best for me" / "evaluated" view filters to
scored jobs. Realtime push reuses the Supabase channel already wired in `use-realtime-jobs.ts`
so results appear as they land. Critically, the only actions offered are *view* and *favorite* —
applying remains the explicitly-gated, separate flow (#19a). Tests are written alongside every
phase: fan-out concurrency cap, pre-filter skip path, cost-gate quota path, idempotent re-run,
and an E2E that batch-evaluates a small synced set and asserts badges appear with zero
auto-action.

## 2. Phases

### Phase 1 — Extract the reusable scoring core

- Goal: Make the #3 evaluation engine callable from a background worker without going through
  the orchestrator, so batch and on-demand share one code path.
- Deliverables:
  - `evaluateJobCore({ userId, jobId, weightOverride?, includeInterviewPlan? })` in
    `packages/ai/src/agents/evaluate-job-core.ts`, returning the `Artifact<"evaluation">`
    (epic #5) and performing the `evaluations` upsert.
  - The existing `evaluateJob` tool (`packages/ai/src/tools/evaluate-job.ts`, owned by #3)
    delegates to the core — no behaviour change for chat callers.
  - Export `evaluateJobCore` from `packages/ai/src/index.ts` for cross-package import by
    `packages/triggers`.
- Exit criteria: `evaluateJobCore` unit-tested against a fixture job (deterministic dims
  computed without the LLM); the on-demand tool path still passes its existing #3 tests; CI green.

### Phase 2 — Cost gate + cheap pre-filter

- Goal: Ensure expensive LLM evaluation only runs above a score floor and within per-tier quota.
- Deliverables:
  - `scoreFloorPrefilter(userId, job)` in `packages/ai/src/agents/score-floor-prefilter.ts` —
    LLM-free, reuses #3's deterministic-dimension helpers to produce a rough 1–5 estimate.
  - Consumption of `withCostGate` from epic #6 (`packages/utils` policy module). If #6 has not
    landed, this phase ships a minimal `withCostGate(scoreFloor | quota)` in `packages/utils/src/`
    and #6 absorbs it — additive, no duplication kept.
  - Per-tier batch quota constants in `packages/utils/src/constants.ts` (free vs pro), enforced
    via the existing `checkRateLimit` plumbing in `packages/ai/src/rate-limit.ts`.
- Exit criteria: pre-filter returns a numeric estimate and a skip/keep decision unit-tested;
  cost-gate quota path unit-tested (over-quota skips, under-quota proceeds); CI green.

### Phase 3 — `batch-evaluate` Trigger.dev task + run tracking

- Goal: Background fan-out with bounded concurrency and idempotent persistence.
- Deliverables:
  - `batch_evaluation_runs` table in `packages/db/src/schema/batch-evaluation-runs.ts`
    (status, counts, jobIds snapshot) + export in `packages/db/src/schema/index.ts` + `db:push`.
  - `batchEvaluateTask` in `packages/triggers/src/batch-evaluate.ts`: pre-filter → cost-gate →
    bounded-concurrency fan-out to `evaluateJobCore` → idempotent upserts → update run counts.
  - Export from `packages/triggers/src/index.ts`.
- Exit criteria: task respects a concurrency cap; below-floor / over-quota jobs are recorded as
  skipped, not evaluated; a re-run of the same job set updates rows in place (no duplicates);
  fan-out + skip + idempotency unit-tested; CI green.

### Phase 4 — Enqueue API, progress + results UI (realtime), no auto-action

- Goal: Let a user start a batch, watch progress, and see results — surfaced, never acted on.
- Deliverables:
  - `POST /api/jobs/batch-evaluate` (enqueue) and `GET /api/jobs/batch-evaluate/[runId]`
    (progress) under `apps/web/app/api/jobs/batch-evaluate/`, using `requireSessionUser()`,
    `applyRateLimit`, Zod schema in `apps/web/lib/api-schemas.ts`, `apiSuccess/apiError`.
  - `case "batchEvaluate"` in `apps/web/hooks/use-canvas-sync.ts` + a progress/results overlay
    card `apps/web/components/canvas/batch-evaluation-card.tsx` (template:
    `salary-insights-card.tsx`).
  - Realtime result push via the existing Supabase channel (`apps/web/hooks/use-realtime-jobs.ts`
    / `packages/supabase/src/realtime.ts`); evaluated jobs light up the #3 score badge on
    `job-card.tsx`.
  - System-prompt note in `packages/ai/src/prompts.ts` documenting the batch capability and the
    no-auto-action invariant.
- Exit criteria: a user enqueues a batch from chat/UI; progress polls/streams; results appear
  with badges; the only offered actions are view/favorite (no apply/send); E2E green; CI green.

## 3. Packages Touched

| Package                                                                 | Change                                                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/ai/src/agents/evaluate-job-core.ts`                           | New: extracted reusable scoring core shared by the `evaluateJob` tool and the batch task                  |
| `packages/ai/src/agents/score-floor-prefilter.ts`                       | New: LLM-free deterministic pre-filter producing a rough 1–5 estimate                                     |
| `packages/ai/src/tools/evaluate-job.ts`                                 | Edit (delegates to core; owned by #3 — no behaviour change)                                               |
| `packages/ai/src/index.ts`                                              | Export `evaluateJobCore` + `scoreFloorPrefilter` for cross-package use                                    |
| `packages/ai/src/rate-limit.ts`                                         | Edit: add `checkBatchEvaluateQuota(userId, isSubscribed)` reusing `checkRateLimit`                        |
| `packages/ai/src/prompts.ts`                                            | Edit: document the batch-evaluate capability + no-auto-action invariant in the orchestrator prompt        |
| `packages/utils/src/index.ts` + `packages/utils/src/constants.ts`       | `withCostGate` (if #6 not yet landed) + per-tier batch quota constants                                    |
| `packages/db/src/schema/batch-evaluation-runs.ts`                       | New table: run lifecycle + per-job outcome counts                                                         |
| `packages/db/src/schema/index.ts`                                       | Export the new table; `pnpm db:push`                                                                      |
| `packages/triggers/src/batch-evaluate.ts`                               | New `batchEvaluateTask`: pre-filter → cost-gate → bounded-concurrency fan-out → idempotent upserts        |
| `packages/triggers/src/index.ts`                                        | Export `batchEvaluateTask`                                                                                |
| `apps/web/app/api/jobs/batch-evaluate/route.ts`                         | New: enqueue a run (auth, rate-limit, Zod)                                                                |
| `apps/web/app/api/jobs/batch-evaluate/[runId]/route.ts`                 | New: progress for a run                                                                                   |
| `apps/web/lib/api-schemas.ts`                                           | Edit: Zod schema for the batch-evaluate request                                                           |
| `apps/web/hooks/use-canvas-sync.ts`                                     | Edit: add `case "batchEvaluate"` to `handleToolResult`                                                    |
| `apps/web/components/canvas/batch-evaluation-card.tsx`                  | New overlay card (template: `salary-insights-card.tsx`)                                                   |
| `apps/web/hooks/use-realtime-jobs.ts`                                   | Edit (reuse): push landed evaluations to the canvas                                                       |
| `packages/jobs-api`                                                     | (no change) — batch scores already-synced `jobs`; sourcing stays Ever Jobs-side per the partition rule    |

## 4. Dependencies

| Library                | Version  | Rationale                                                                                       |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `@trigger.dev/sdk`     | existing | v3 already used for `sync-jobs` / alerts; provides bounded-concurrency batch fan-out + retries  |
| `@upstash/ratelimit`   | existing | per-tier quota already powers `rate-limit.ts`; reuse for the batch quota gate                   |
| `ai` (Vercel AI SDK)   | existing | `generateObject` retry-on-mismatch already used by the #5 structured harness the core calls     |
| `zod`                  | existing | request validation + the #5 machine-summary contract                                            |
| `drizzle-orm`          | existing | `batch_evaluation_runs` schema + idempotent upsert on the existing `(userId, jobId)` unique     |

No new direct dependencies. All four phases reuse libraries already in the workspace.

## 5. Risks & Mitigations

| Risk                                                              | Likelihood | Impact | Mitigation                                                                                          |
| ---------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------- |
| Unbounded fan-out stampedes the model provider / DB              | M          | H      | Hard concurrency cap in `batchEvaluateTask`; Trigger.dev queue concurrency; per-tier quota gate     |
| LLM cost balloons on large batches                              | M          | H      | Cheap deterministic pre-filter (score floor) before any LLM call + `withCostGate` quota             |
| Upstream `evaluateJob` (#3) tool not yet extracted to a core    | M          | H      | Phase 1 explicitly extracts `evaluateJobCore`; tool delegates — additive, both paths tested         |
| Upstream `withCostGate` (#6) not yet landed                     | M          | M      | Ship a minimal `withCostGate` in `packages/utils` that #6 later absorbs — no duplicate kept         |
| Duplicate evaluations on re-run                                 | L          | M      | Idempotent upsert on `evaluations_user_job_unique (userId, jobId)`; re-run updates in place          |
| A batch silently "acts" (auto-favorite/apply) — brand breach    | L          | H      | Task only writes `evaluations`; outward-action tools are untouched; invariant test + E2E assert it   |
| Partial failure leaves a run stuck                              | M          | M      | Per-job try/catch (mirrors `sync-jobs`); run row records failed count; run marked `done` not stuck   |
| Stale progress in UI                                           | M          | L      | Poll `GET .../[runId]` + Supabase realtime; safety timeout in the canvas card                        |

## 6. Rollback Plan

- The feature is gated end-to-end: removing the `batchEvaluateTask` deployment (or disabling the
  Trigger.dev task) stops all fan-out; the enqueue route returns a disabled response. No existing
  flow depends on it.
- `evaluateJobCore` is purely additive; the `evaluateJob` tool delegates to it but can be reverted
  to its inline body in one edit if needed.
- `batch_evaluation_runs` is a new, isolated table — dropping it does not touch `evaluations`,
  `jobs`, or `users`. No data already produced (the `evaluations` rows) is lost on rollback; they
  are identical to on-demand evaluations.
- The canvas `case "batchEvaluate"` and overlay card are inert when no batch result arrives, so
  the UI degrades gracefully to today's behaviour.

## 7. Migration Plan (if applicable)

- One additive `pnpm db:push` for `batch_evaluation_runs`. No backfill: existing `evaluations`
  rows are already in the shape batch produces, so they appear in the "evaluated" view immediately.
- No existing columns or tables are altered or removed. Per-tier quota constants are new keys in
  `packages/utils/src/constants.ts`; absent values fall back to conservative free-tier caps.

## 8. Open Questions for Plan

- **Batch source contract:** does a run accept (a) an explicit `jobIds[]`, (b) a saved-search id,
  or (c) both? MVP assumes an explicit `jobIds[]` plus an optional search-filter payload; saved
  searches as a first-class object is a later epic. Confirm before Phase 4.
- **Score-floor source:** is the floor a user preference (`users.preferences.batchScoreFloor`) or a
  fixed per-tier default? Plan assumes a per-tier default with an optional user override; confirm.
- **Concurrency cap value:** start at a conservative fixed cap (e.g. 5) tuned against the model
  provider's limits; confirm the target before load-testing.
- **Does #6's `withCostGate` exist at implementation time?** If yes, Phase 2 imports it from
  `packages/utils`; if no, Phase 2 ships the minimal version there for #6 to absorb. Resolve at
  kickoff to avoid a duplicate.
