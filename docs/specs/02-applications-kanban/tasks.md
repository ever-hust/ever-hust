# Tasks: 02 — Applications Pipeline (Kanban)

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Data model + backfill

- [ ] T01 — Add pipeline columns + index to the `applications` schema
  - **Files:** `packages/db/src/schema/applications.ts` (add `pipelineStage` text enum
    `["evaluated","drafting","applied","responded","interview","offer","won","lost","skip"]`
    `.notNull().default("applied")`, `stageChangedAt` timestamp `.notNull().defaultNow()`,
    `sortOrder` integer `.notNull().default(0)`, and `index("applications_user_stage_idx").on(table.userId, table.pipelineStage)`); `packages/db/src/schema/index.ts` (confirm `applications` still exported — no change expected).
  - **Acceptance:** new columns follow house style (text-enum, defaulted, indexed); existing
    columns and the legacy `status` enum are untouched; `pnpm check-types` passes for `packages/db`.
  - **Estimate:** 0.5 day

- [ ] T02 — Push schema and backfill existing rows
  - **Files:** `packages/db/drizzle.config.ts` (no change — confirm `schema=./src/schema/index.ts`); a one-shot idempotent backfill script under `packages/db/src/` (maps legacy `status` → `pipelineStage`, stamps `stageChangedAt` from `updatedAt`).
  - **Acceptance:** `pnpm db:push` applies cleanly; after backfill every existing
    `applications` row has a non-null `pipelineStage` and `stageChangedAt`; script is
    re-runnable without double-writing; documented mapping (`submitted→applied`,
    `in_progress→drafting`, `pending→evaluated`, `failed→lost`).
  - **Estimate:** 0.5 day

## Phase 2 — Pure state machine + dedup

- [ ] T03 — `STATUS_RANK` + `isValidTransition` (+ unit tests)
  - **Files:** `packages/utils/src/pipeline.ts` (new); export from `packages/utils/src/index.ts`; `packages/utils/src/pipeline.test.ts` (alongside).
  - **Acceptance:** `STATUS_RANK` orders stages per spec (`won(7) > offer(6) > interview(5) >
    responded(4) > applied(3) > … lost(1) > skip(0)`); `isValidTransition(from,to)` is pure and
    total; tests cover every legal and illegal transition; `pnpm test -- --selectProjects utils` green.
  - **Estimate:** 0.5 day

- [ ] T04 — `mergeApplications` rank-preserving merge (+ unit tests)
  - **Files:** `packages/utils/src/pipeline.ts`; `packages/utils/src/pipeline.test.ts`.
  - **Acceptance:** `mergeApplications(a, b)` returns the row with the higher `STATUS_RANK`
    and the earlier applied date; never regresses an active application; pure, no I/O; tests
    cover tie-breaks and terminal-vs-active cases; `pnpm test -- --selectProjects utils` green.
  - **Estimate:** 0.5 day

- [ ] T05 — Fuzzy `matchApplications` (normalized company + role title) (+ unit tests)
  - **Files:** `packages/utils/src/match-applications.ts` (new); export from `packages/utils/src/index.ts`; `packages/utils/src/match-applications.test.ts`.
  - **Acceptance:** normalizes company (case/whitespace/legal-suffix) and fuzzy-matches role
    title above a conservative threshold; pure function; tests cover true positives
    (same role, moved URL), true negatives (different roles, same company), and edge cases;
    `pnpm test -- --selectProjects utils` green.
  - **Estimate:** 1 day

## Phase 3 — Transition + grouped-list API

- [ ] T06 — Zod schemas for stage transition + grouped list
  - **Files:** `apps/web/lib/api-schemas.ts` (add `applicationStageTransitionSchema` and any query schema, `.max()`-bounded).
  - **Acceptance:** transition schema validates `{ applicationId: number, toStage: enum, sortOrder?: number }`; rejects unknown stages; matches the schema style of the existing `favoriteToggleSchema`; covered by a test in `apps/web/lib/api-schemas.test.ts`.
  - **Estimate:** 0.5 day

- [ ] T07 — Stage-transition API route (tx-safe) (+ unit test)
  - **Files:** `apps/web/app/api/user/applications/stage/route.ts` (new); uses `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, Zod from `apps/web/lib/api-schemas.ts`, `apiBadRequest()`/`apiError()` from `apps/web/lib/api-response.ts`; imports `isValidTransition`/`STATUS_RANK` from `@ever-hust/utils`; route test in `apps/web/app/api/user/applications/stage/route.test.ts`.
  - **Acceptance:** writes `pipelineStage` + `stageChangedAt` inside a `db.transaction` that
    re-reads the row and rejects out-of-rank regressions (TOCTOU-safe, mirrors
    `favorite-job.ts`); enforces row ownership (`userId`); returns the updated row; unit test
    covers happy path, regression-rejection, and not-owner 403/404.
  - **Estimate:** 1 day

- [ ] T08 — Grouped-by-stage list API with aggregates (+ unit test)
  - **Files:** `apps/web/app/api/user/applications/route.ts` (extend existing GET with a `groupBy=stage` mode, or add `apps/web/app/api/user/applications/board/route.ts`); reuses `requireSessionUser()` + `applyRateLimit()`; test alongside.
  - **Acceptance:** returns applications grouped by `pipelineStage` with per-column count,
    aggregate value, and time-in-stage (from `stageChangedAt`); SLA-breach flag computed from
    `apps/web/lib/constants.ts` thresholds; existing flat-list behaviour preserved; unit test
    asserts grouping + aggregate math; `pnpm test -- --selectProjects web-lib` green.
  - **Estimate:** 1 day

## Phase 4 — Kanban UI + detail view

- [ ] T09 — Add `@dnd-kit` deps and Kanban board scaffold
  - **Files:** `apps/web/package.json` (`@dnd-kit/core`, `@dnd-kit/sortable`); `apps/web/components/canvas/applications-kanban.tsx` (new); reuses `@ever-hust/ui/card`, `@ever-hust/ui/badge`, `cn()`.
  - **Acceptance:** `pnpm install` resolves with no peer conflict; board renders columns per
    stage from the grouped-list API; column headers show count + aggregate + time-in-stage;
    SLA-breach cards visibly flagged; `pnpm lint` + `pnpm check-types` green.
  - **Estimate:** 1 day

- [ ] T10 — Drag-to-stage with optimistic update + rollback
  - **Files:** `apps/web/components/canvas/applications-kanban.tsx`; new card component `apps/web/components/canvas/application-kanban-card.tsx` (modeled on `apps/web/components/canvas/job-card.tsx` / `salary-insights-card.tsx`).
  - **Acceptance:** dropping a card optimistically moves it and POSTs to the stage route;
    on non-2xx it rolls back to the prior column and shows a toast; card shows title, source
    icon, fit score (from #3 when present, hidden when absent), company, time-in-stage;
    keyboard drag works (`@dnd-kit` a11y).
  - **Estimate:** 1 day

- [ ] T11 — View toggle (Kanban vs. existing list) on the applications page
  - **Files:** `apps/web/app/(dashboard)/applications/page.tsx`; flag/constant in `apps/web/lib/constants.ts`.
  - **Acceptance:** a toggle switches between the existing list view and the new Kanban; the
    legacy `status`-filter list remains fully functional and is the fallback when the flag is
    off; toggle state is unobtrusive and accessible.
  - **Estimate:** 0.5 day

- [ ] T12 — Application detail view (timeline + stage selector + actions)
  - **Files:** `apps/web/components/canvas/application-detail-panel.tsx` (new, modeled on `apps/web/components/canvas/job-detail-panel.tsx`); wired from the Kanban card; reuses `@ever-hust/ui/dialog`.
  - **Acceptance:** shows the proposal/cover letter + job details + a chronological activity
    timeline + a stage selector + mark-won / mark-lost / archive actions; stage selector and
    actions call the transition route; no action submits or sends anything externally
    (human-in-the-loop preserved).
  - **Estimate:** 1 day

## Phase 5 — Agent surface + E2E

- [ ] T13 — `getPipeline` AI tool (Zod-validated structured result) (+ unit test)
  - **Files:** `packages/ai/src/tools/get-pipeline.ts` (new — `tool({ description, inputSchema: z.object({...}).max()-bounded, execute })`, `userId` NOT an LLM param); export from `packages/ai/src/tools/index.ts`; `packages/ai/src/tools/get-pipeline.test.ts`.
  - **Acceptance:** returns a Zod-validated object (stages with count/aggregate/time-in-stage,
    no raw PII per Article 8); read-only over the caller's own rows; all string/array inputs
    `.max()`-bounded; unit test asserts the structured shape; `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

- [ ] T14 — Register `getPipeline` in the orchestrator + system prompt
  - **Files:** `packages/ai/src/agents/orchestrator.ts` (add to the `tools: { ... }` object inside `streamText`, inject `userId` server-side like `favoriteJob`); `packages/ai/src/prompts.ts` (`getOrchestratorPrompt` — document the new tool; mirror in the Langfuse `orchestrator-system` prompt); extend `packages/ai/src/agents/orchestrator.test.ts`.
  - **Acceptance:** orchestrator test confirms `getPipeline` is registered; `stopWhen
    stepCountIs(5)` unchanged; `userId` is server-injected, never LLM-supplied; prompt names
    and describes the tool; `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

- [ ] T15 — Canvas sync for the pipeline tool result
  - **Files:** `apps/web/hooks/use-canvas-sync.ts` (add `case "getPipeline"` to `handleToolResult`, surface pipeline state; add a `pipeline` field to `CanvasState`).
  - **Acceptance:** a `getPipeline` tool result updates canvas state and renders the Kanban
    on the canvas; unknown-tool default branch untouched; no regression to existing
    `searchJobs`/`favoriteJob`/`salaryInsights` cases; `pnpm lint` + `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T16 — E2E: drag-to-stage persists + duplicate merges
  - **Files:** `tests/e2e/applications.spec.ts` (new, baseURL `http://localhost:8443`); fixtures under `tests/e2e/fixtures/` if needed.
  - **Acceptance:** test drags an application across a stage, reloads, and asserts the stage
    persisted (tx-safe); re-applying to a moved-URL same role merges into the existing card
    keeping the more-advanced stage; `pnpm test:e2e` green.
  - **Estimate:** 1 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task
  (T03/T04/T05/T07/T08/T13/T14 each ship with their tests; T16 is the dedicated E2E gate).
- Verify **zero competitor references** before every commit (constitution Article 11) — grep
  staged changes against the untracked competitor list.
- Pipeline state is identity-bound Hust data per the Partition Rule (Article 6) —
  `packages/jobs-api` is not touched.
- Human-in-the-loop (Article 4): dragging a card or changing a stage records user intent only;
  no action submits, sends, or applies anything externally.
- CI (lint, type-check, unit, E2E) must be green before merge; work lands on `develop`.
- Update `docs/specs/ROADMAP.md` progress when this epic's tasks complete.
