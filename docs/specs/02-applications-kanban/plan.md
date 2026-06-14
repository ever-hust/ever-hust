# Plan: 02 — Applications Pipeline (Kanban)

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

This epic turns `/applications` from a status-filtered list into a drag-and-drop pipeline
command center, layered **additively** on the existing `applications` table. No table is
removed, no enum is replaced; we **add** a richer `pipelineStage` state machine alongside the
current `status` column, backfilled on first push. This honours Non-negotiable #9 (improve
additively) and the constitution's spec-first, standalone-first posture: the only hard
external dependency stays the Ever Jobs API, and nothing here touches the apply/submit gate,
so the human-in-the-loop guarantee (Article 4) is untouched — dragging a card never submits or
sends anything; it only records where the user has manually moved their own application.

The work decomposes into four layers, each landing behind the next:

1. **Data model** — add `pipelineStage` (text enum), `stageChangedAt` (timestamp), and
   `sortOrder` (integer, for in-column ordering) to `packages/db/src/schema/applications.ts`,
   plus a `(userId, pipelineStage)` index. Apply with `pnpm db:push`. Backfill maps the
   legacy `status` to a starting stage so existing rows render immediately.

2. **Pure domain logic** — a `STATUS_RANK` map and a rank-preserving `mergeApplications`
   function, plus a normalized `(company, role)` fuzzy matcher, all as pure, unit-tested
   functions in `packages/utils/src/`. These have zero I/O so they are trivially testable and
   reusable by both the stage-transition API and any future dedup pass. The rank guarantees a
   merge never regresses an already-advanced application.

3. **API** — a stage-transition endpoint and a stage-grouped list endpoint under
   `apps/web/app/api/user/applications/`, following the house route pattern
   (`requireSessionUser()` → `applyRateLimit()` → Zod validation from `lib/api-schemas.ts` →
   `apiBadRequest()`/`apiError()`). The transition is wrapped in a `db.transaction` and is
   TOCTOU-safe, mirroring the proven `favoriteJobTool` pattern (re-read the row inside the tx,
   compare ranks, then write `pipelineStage` + `stageChangedAt`).

4. **UI + agent surface** — a Kanban board component under `apps/web/components/canvas/` with
   optimistic drag-to-stage (rollback on error), per-column count + aggregate value +
   time-in-stage, and SLA-breach flags; an Application detail view with a chronological
   activity timeline and stage selector; and a `getPipeline` AI tool so the orchestrator can
   read and narrate the user's pipeline. Per Article 5 the tool returns a Zod-validated
   structured object that flows to the canvas via a new `case "getPipeline"` in
   `use-canvas-sync.ts`.

The fit score on each card is sourced from the **evaluation engine (epic #3)** when present
and degrades gracefully (no score shown) when absent — this epic does not block on #3. This
epic is the **producer** of stage/transition data that the follow-up-cadence (#9) and
funnel-analytics (#8) epics consume; we expose the timeline/transition records they will read
but do not implement nudges or cross-user funnels here (those are explicit non-goals in the
spec).

Drag-and-drop needs one new direct dependency (`@dnd-kit/core` + `@dnd-kit/sortable`). It is
the current, actively maintained, accessible (keyboard + screen-reader) primitive that fits
React 19 / Next.js 16 with no peer conflicts, justified per Article 10.5.

## 2. Phases

### Phase 1 — Data model + backfill

- **Goal:** `applications` carries an explicit pipeline stage, persisted and indexed, with
  existing rows backfilled so the board renders on day one.
- **Deliverables:** `pipelineStage`, `stageChangedAt`, `sortOrder` columns + `(userId,
  pipelineStage)` index in `packages/db/src/schema/applications.ts`; export unchanged from
  `packages/db/src/schema/index.ts`; `pnpm db:push` applied; idempotent backfill mapping
  legacy `status` → stage.
- **Exit criteria:** schema pushes cleanly; every existing application row has a non-null
  `pipelineStage` and `stageChangedAt`; `pnpm check-types` and `pnpm test -- --selectProjects
  db` green.

### Phase 2 — Pure state machine + dedup

- **Goal:** a deterministic, side-effect-free core for stage transitions and duplicate merges.
- **Deliverables:** `STATUS_RANK`, `mergeApplications`, `isValidTransition`, and
  `matchApplications` (normalized company + fuzzy role title) in `packages/utils/src/`,
  exported from `packages/utils/src/index.ts`; unit tests alongside.
- **Exit criteria:** unit tests cover rank-preservation (merge keeps the more-advanced row and
  the earlier applied date), every legal/illegal transition, and fuzzy match true/false
  positives; `pnpm test -- --selectProjects utils` green.

### Phase 3 — Transition + grouped-list API

- **Goal:** server endpoints to move an application between stages (tx-safe) and to list
  applications grouped by stage with per-column aggregates.
- **Deliverables:** Zod schemas in `apps/web/lib/api-schemas.ts`; stage-transition route and
  grouped-list route under `apps/web/app/api/user/applications/`; both auth-gated,
  rate-limited, Zod-validated, transaction-wrapped where they write.
- **Exit criteria:** transition persists `pipelineStage` + `stageChangedAt` atomically and
  rejects out-of-rank regressions; grouped list returns counts + aggregate value +
  time-in-stage per column; `pnpm test -- --selectProjects web-lib` green.

### Phase 4 — Kanban UI + detail view

- **Goal:** the user can see and drag their pipeline, and drill into an application.
- **Deliverables:** Kanban board + column + card components in
  `apps/web/components/canvas/`; a view toggle on
  `apps/web/app/(dashboard)/applications/page.tsx`; Application detail view with timeline,
  stage selector, and won/lost/archive actions.
- **Exit criteria:** drag-to-stage is optimistic with rollback on API error; column headers
  show count + aggregate + time-in-stage; SLA-breach cards are visibly flagged; reload
  preserves the new stage; `pnpm lint` + `pnpm check-types` green.

### Phase 5 — Agent surface + E2E

- **Goal:** the orchestrator can read the pipeline, results reach the canvas, and the flow is
  end-to-end verified.
- **Deliverables:** `getPipelineTool` in `packages/ai/src/tools/`, exported from
  `index.ts`, registered in `packages/ai/src/agents/orchestrator.ts`, documented in
  `packages/ai/src/prompts.ts`; `case "getPipeline"` in `apps/web/hooks/use-canvas-sync.ts`;
  Playwright spec in `tests/e2e/`.
- **Exit criteria:** orchestrator unit test sees the registered tool; tool returns a
  Zod-validated object; E2E proves drag-to-stage persists across reload and a duplicate
  re-application merges into the existing card; full `pnpm test` + `pnpm test:e2e` green; CI
  green; zero competitor references.

## 3. Packages Touched

| Package                                                            | Change                                                                                                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db`                                                     | Add `pipelineStage`, `stageChangedAt`, `sortOrder` columns + `(userId, pipelineStage)` index to `src/schema/applications.ts`; `pnpm db:push`. No new export needed (`applications` already in `src/schema/index.ts`). |
| `packages/utils`                                                 | New pure logic in `src/` (`STATUS_RANK`, `mergeApplications`, `isValidTransition`, `matchApplications`) + tests; export from `src/index.ts`.                                            |
| `apps/web`                                                       | New stage-transition + grouped-list routes under `app/api/user/applications/`; Zod schemas in `lib/api-schemas.ts`; Kanban + detail components in `components/canvas/`; view toggle on `app/(dashboard)/applications/page.tsx`; `case "getPipeline"` in `hooks/use-canvas-sync.ts`; E2E in `tests/e2e/`. |
| `packages/ai`                                                    | New `src/tools/get-pipeline.ts`; export in `src/tools/index.ts`; register in `src/agents/orchestrator.ts` (`tools: { ... }`, `userId` injected server-side); document in `src/prompts.ts`. |
| `packages/jobs-api`                                             | (no change) — pipeline is identity-bound Hust state per the Partition Rule; the Ever Jobs API is not involved.                                                                          |
| `packages/ui`                                                    | (reuse only) — `@ever-hust/ui/button`, `@ever-hust/ui/card`, `@ever-hust/ui/badge`, `@ever-hust/ui/dialog`, `cn()` from `@ever-hust/ui/lib/utils`. No new component unless a shared primitive emerges.            |

## 4. Dependencies

| Library              | Version | Rationale                                                                                                                                              |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dnd-kit/core`      | latest  | Accessible (keyboard + pointer + screen-reader) drag primitive; no peer-dep conflict with React 19 / Next.js 16; actively maintained. The repo has no drag lib today. |
| `@dnd-kit/sortable`  | latest  | In-column ordering (`sortOrder`) and cross-column moves built on `@dnd-kit/core`; avoids hand-rolling pointer math.                                    |

Upstream epics this plan assumes:

- **#5 structured-output** — the shared Zod-result contract every AI tool emits; `getPipeline`
  conforms to it. Hard contract dependency.
- **#3 evaluation-engine** — supplies the per-card fit score; consumed when present, degrades
  gracefully when absent (no hard block).
- **#6 guardrails** — grounding/no-invent helpers; `getPipeline` is read-only over the user's
  own rows so the no-invent risk is low, but it adopts the shared guardrail wrappers.

Downstream consumers (out of scope here, but this epic produces their inputs): **#9
follow-up-cadence** and **#8 funnel-analytics**.

## 5. Risks & Mitigations

| Risk                                                                  | Likelihood | Impact | Mitigation                                                                                                       |
| -------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Concurrent drags / double-submit regress an advanced stage           | M          | H      | Transaction-wrapped transition re-reads the row and compares `STATUS_RANK` inside the tx (mirrors `favoriteJobTool`); reject regressions. |
| Optimistic UI drifts from server on API failure                      | M          | M      | Roll back to prior column on non-2xx; re-fetch grouped list on error; surface a toast.                          |
| Fuzzy dedup false-positive merges two genuinely different roles      | L          | H      | Conservative threshold; require normalized-company exact match AND high role similarity; unit-test edge cases; merge is recoverable via the un-merged source rows being retained, not hard-deleted. |
| Backfill mis-maps legacy `status` to a wrong stage                   | L          | M      | Idempotent, documented mapping; dry-run count before/after; legacy `status` column retained untouched as the source of truth for re-backfill. |
| New `@dnd-kit` deps add bundle weight / peer conflict                | L          | L      | Tree-shakeable, scoped to the Kanban route; verified against React 19 before merge; `pnpm build` size check.    |
| `getPipeline` tool leaks PII into LLM context                        | L          | M      | Return only stage/title/company/score/timestamps; no raw CV/email/phone (Article 8); `.max()` bounds on all schema strings/arrays. |

## 6. Rollback Plan

The feature is additive and reversible without data loss:

1. **UI kill switch** — gate the Kanban toggle on
   `apps/web/app/(dashboard)/applications/page.tsx` behind a feature flag; flipping it off
   restores the existing list view (the legacy `status` filter UI stays intact).
2. **Agent surface** — remove `getPipeline` from the `tools: { ... }` object in
   `packages/ai/src/agents/orchestrator.ts` and its `prompts.ts` mention; the orchestrator
   reverts to its prior tool set.
3. **Data** — the new columns are nullable/defaulted and the legacy `status` enum is
   untouched, so no migration-down is required; the columns can simply stop being read. No
   destructive drop is performed as part of normal rollback.

## 7. Migration Plan

- `pnpm db:push` adds `pipelineStage` (default `applied`), `stageChangedAt` (default
  `now()`), and `sortOrder` to the existing `applications` table — no data is rewritten by the
  DDL itself.
- A one-shot, idempotent backfill maps each existing row's legacy `status` to a starting
  stage (e.g. `submitted → applied`, `in_progress → drafting`, `pending → evaluated`,
  `failed → lost`) and stamps `stageChangedAt` from `updatedAt`. Re-runnable; only fills
  null/default rows.
- Existing consumers (the current `/api/user/applications` list and
  `app/(dashboard)/applications/page.tsx`) keep working: they read `status`, which is
  unchanged. New consumers read `pipelineStage`. The two coexist; no caller is forced to
  migrate in this epic.

## 8. Open Questions for Plan

- **Backfill mapping for `failed`** — map to terminal `lost`, or to `applied` so the user can
  re-triage? (Proposed: `lost`, since `failed` is a dead application; revisit if users want a
  retry lane.)
- **SLA thresholds** — what time-in-stage flags a stall per stage (e.g. `applied` 14d,
  `interview` 7d)? Needs a product decision; default constants live in
  `apps/web/lib/constants.ts` until #9 owns cadence.
- **Dedup trigger point** — run `matchApplications` only on new-application creation, or also
  as a one-time pass over existing rows? (Proposed: on-create only for this epic; a sweep
  belongs with #8/#9.)
- **In-column ordering persistence** — is `sortOrder` user-set (manual reorder) or
  derived (by `stageChangedAt`)? (Proposed: manual via `@dnd-kit/sortable`, defaulting to
  `stageChangedAt`.)
