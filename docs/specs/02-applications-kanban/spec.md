# Spec #2 — Applications Pipeline (Kanban)

> Status: Draft · Owner: Hust · Effort: M · Phase 1 (quick win) · Depends on: — (extends existing `applications`)

## 1. Problem & user value

Today `/applications` is a **status-filtered list with count tiles** — a record, not a workflow.
Job-seeking is a pipeline (a deal flow), and users need to *see* and *move* applications through
stages, spot stalls, and measure conversion. Turning the list into a **Kanban command center**
makes Hust the place the whole search is run, not just where jobs are found.

## 2. Scope

**In:** a drag-and-drop Kanban over the existing `applications` table; a richer **pipeline-stage**
state machine; **fuzzy dedup** of *this user's* applications (same role at a moved URL); per-column
**counts + aggregate value + time-in-stage**; an Application detail view with an activity timeline.

**Out:** follow-up nudges ([#9](../09-follow-up-cadence/spec.md)), funnel analytics across users
([#8](../08-funnel-analytics/spec.md)) — this epic produces the stage data they consume.

## 3. Design

### 3.1 Pipeline stages

Today: `applications.status` = `pending | in_progress | submitted | failed`; `user_jobs.status` =
`viewed | applied | favorited | rejected | hidden`. Introduce an explicit **pipeline stage** on
`applications` (additive column, not a removal):

`evaluated → drafting → applied → responded → interview → offer → won` (+ terminal `lost`, `skip`).

A **rank-preserving state machine** governs transitions and dedup merges:
`STATUS_RANK` (e.g. `applied(3) > responded(4) > interview(5) > offer(6) > won(7) > lost(1) > skip(0)`),
so collapsing a duplicate keeps the **most-advanced** application, never regressing an active one.

### 3.2 Fuzzy dedup (this user's apps)

Same role re-posted at a moved URL shouldn't create a second card. Dedup on
`(normalized company, fuzzy role title)` within a user's applications; on collision, merge keeping
the higher `STATUS_RANK` (and the earlier `appliedDate`). Pure, unit-tested function.

### 3.3 UI

- **Kanban view** (toggle vs. table): columns = stages; cards show title, source icon, fit score
  (from [#3](../03-evaluation-engine/spec.md)), company, time-in-stage; **drag** to change stage
  (optimistic + tx-safe server update). Column header = count + aggregate (e.g. "Interview (3) ·
  $",). SLA-breach cards flagged.
- **Application detail:** proposal + job details + chronological activity timeline + stage selector
  + actions (mark won/lost, archive).

## 4. Data model

- `applications`: **add** `pipelineStage` (text enum, default `applied`), `stageChangedAt`
  (timestamp), optional `sortOrder` (for in-column ordering). Keep existing columns.
- No table removed. Indexes: `(userId, pipelineStage)`.

## 5. Implementation plan

1. Add `pipelineStage` + `stageChangedAt` (+ `sortOrder`) via Drizzle migration; backfill from
   current `status`.
2. Pure `mergeApplications` / `STATUS_RANK` + fuzzy `company::role` matcher (unit-tested).
3. API: stage-transition endpoint (tx-wrapped, TOCTOU-safe like `favoriteJob`); list grouped by
   stage.
4. Kanban UI (reuse canvas/card components; a drag lib already common in the stack) with optimistic
   updates + rollback on error.
5. Application detail page (timeline + stage selector + actions).

## 6. Tasks

- [ ] Migration: `pipelineStage`, `stageChangedAt`, `sortOrder` (+ backfill).
- [ ] `STATUS_RANK` + `mergeApplications` + fuzzy matcher (+ unit tests).
- [ ] Stage-transition + grouped-list API (tx-safe; Zod-validated).
- [ ] Kanban board UI (drag, counts, time-in-stage, SLA flag).
- [ ] Application detail page (timeline + actions).
- [ ] Tests: state-machine transitions, dedup merge, E2E drag-to-stage persists.

## 7. Acceptance

- A user can drag an application across stages; the change persists (tx-safe) and survives reload.
- Re-applying to a moved-URL same role merges into the existing card, keeping the advanced stage.
- Column counts/aggregates/time-in-stage render; detail page shows the timeline.
- Unit + E2E green; **zero competitor references** (per workspace `RULES.md`).
