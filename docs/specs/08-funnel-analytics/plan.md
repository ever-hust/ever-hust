# Plan: 08 — Funnel & Rejection-Pattern Analytics

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

Once applications carry stages (`stageChangedAt`, from epic #2) and jobs carry scores/bands/family
(from the evaluation engine #3), Hust can show a seeker how their search is actually performing and
turn the pipeline into a self-improving advisor. This epic is **read-mostly analytics over the
user's own history** — no cross-user/market data (that stays in Ever Jobs `/analyze`, harvested in
epic #1). Everything is scoped to a single `userId`, injected server-side by the orchestrator and by
`requireSessionUser()` on the route; the LLM never supplies it (Article 8).

The core is a set of **pure aggregation functions** in `packages/ai/src/insights/`. They take an
array of plain rows (applications joined to evaluations) and return a single Zod-validated object:
stage conversion rates, time-in-stage, conversion **by segment** (score band, job family, source,
comp range, remote), and the empirical **score floor** — the minimum evaluation score among
applications that ever reached `responded` or beyond. Keeping the math pure and row-driven means we
can unit-test every edge case (zero history, all-stalled, ties at the floor, single-application
segments) on fixtures with no DB, satisfying Article 10's "every public function has a unit test".

The funnel result is the AI artifact, so it carries a strict machine-readable summary alongside any
prose the orchestrator narrates (Article 5 — structured output everywhere). We surface it two ways
that share the same typed contract: (1) a `getFunnelInsights` AI tool registered in the orchestrator
so the user can ask "how's my search going?" in chat and have the result flow to the canvas via
`useCanvasSync`; and (2) a `GET /api/insights/funnel` route backing a dedicated user-facing
**Insights** page under `(dashboard)`, rendered with the existing card/visualisation patterns
(the `salary-insights-card.tsx` overlay is the template).

Because the rollups join two tables and scan a user's full application history, we add an **optional
`insights_cache` table** (jsonb payload + `computedAt`) so repeat loads don't recompute. The cache is
purely an optimisation — a cache miss recomputes from source — so it carries no correctness risk and
can be dropped without data loss.

The **auto-tune loop** is strictly human-in-the-loop (Article 4). The insights surface a suggestion
("none below 3.8 has ever responded — raise your fit threshold to 3.8"), but Hust never silently
changes targeting. Accepting the suggestion is an explicit user action that writes a soft default
into `users.preferences` (e.g. `preferences.evaluationFloor` / `preferences.evaluationWeights`),
which downstream search/evaluation reads as a *default*, not a hard filter. The suggestion is
**grounded** in the user's own observed history (Article 7) — we never invent a floor for a user with
no `responded`+ applications; we say the data is insufficient.

Phasing is bottom-up: pure math first (testable in isolation), then the read API + tool + cache, then
the Insights page UI and canvas wiring, then the opt-in write-back, then E2E. Standalone-first holds
throughout — the only external dependency remains the Ever Jobs API, untouched here; no Gauzy code is
introduced.

## 2. Phases

### Phase 1 — Pure aggregation engine

- Goal: deterministic, fully unit-tested functions that turn raw application+evaluation rows into a
  funnel-insights object, with a Zod schema as the typed contract.
- Deliverables:
  - `packages/ai/src/insights/funnel.ts` — `computeFunnel(rows)`, `conversionBySegment(rows, dim)`,
    `timeInStage(rows)`, `computeScoreFloor(rows)`.
  - `packages/ai/src/insights/types.ts` — `FunnelInsightsSchema` (Zod) + inferred `FunnelInsights`
    type; segment dimensions enum (`scoreBand | jobFamily | source | compRange | remote`).
  - `packages/ai/src/insights/funnel.test.ts` — fixtures + edge cases.
- Exit criteria: `pnpm test -- --selectProjects ai` green for the new suite; every function has ≥1
  test; score-floor edge cases (no `responded`+, ties, single row) covered; output validates against
  `FunnelInsightsSchema`.

### Phase 2 — Read API, tool & optional cache

- Goal: expose the aggregation behind a `userId`-scoped route and an orchestrator tool, with an
  optional cache table for expensive rollups.
- Deliverables:
  - `packages/db/src/schema/insights-cache.ts` + export from `packages/db/src/schema/index.ts`;
    applied via `pnpm db:push`.
  - `packages/ai/src/insights/query.ts` — `loadFunnelRows(userId)` joining `applications` ↔
    `evaluations` (cache read-through).
  - `packages/ai/src/tools/get-funnel-insights.ts` + export from `packages/ai/src/tools/index.ts`;
    registered in `packages/ai/src/agents/orchestrator.ts` (userId injected server-side).
  - `apps/web/app/api/insights/funnel/route.ts` — `requireSessionUser()` + `applyRateLimit`.
  - Prompt doc update in `packages/ai/src/prompts.ts`.
- Exit criteria: tool returns a `FunnelInsightsSchema`-valid object for a fixture user; route returns
  the same shape with auth + rate-limit; cache miss recomputes, hit short-circuits; unit tests green.

### Phase 3 — Insights page & canvas surfacing

- Goal: render the funnel, by-segment breakdown, and score-floor callout for the user, both on a
  dedicated page and as a canvas overlay when asked in chat.
- Deliverables:
  - `apps/web/components/canvas/funnel-insights-card.tsx` (modelled on `salary-insights-card.tsx`).
  - `case "getFunnelInsights"` added to `apps/web/hooks/use-canvas-sync.ts`.
  - `apps/web/app/(dashboard)/insights/page.tsx` (fetches `/api/insights/funnel`).
- Exit criteria: page renders funnel + segment breakdown + score-floor callout for a fixture-history
  user; chat-triggered tool result appears on the canvas; empty-history state renders a guidance
  message, not a crash.

### Phase 4 — Opt-in auto-tune (human-in-the-loop write-back)

- Goal: let the user explicitly accept the suggested score floor, writing it as a soft default into
  preferences — never silently.
- Deliverables:
  - `apps/web/app/api/insights/apply-floor/route.ts` — POST, `requireSessionUser()`, Zod-validated,
    writes `users.preferences.evaluationFloor`.
  - "Apply this threshold" action in `funnel-insights-card.tsx` (explicit confirm).
  - Schema in `apps/web/lib/api-schemas.ts`.
- Exit criteria: accepting the floor updates `users.preferences`; no write happens without the
  explicit action; users with insufficient history see the suggestion disabled, not a fabricated
  floor.

### Phase 5 — E2E & hardening

- Goal: critical-path Playwright coverage and CI green.
- Deliverables: `tests/e2e/insights.spec.ts`.
- Exit criteria: E2E renders the Insights page and exercises the apply-floor flow against a seeded
  user; `pnpm test:e2e` green; lint + type-check clean; **zero competitor references**.

## 3. Packages Touched

| Package                                                       | Change                                                                                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai`                                                | New `src/insights/` (funnel.ts, query.ts, types.ts + tests); new tool `src/tools/get-funnel-insights.ts` exported from `src/tools/index.ts` and registered in `src/agents/orchestrator.ts`; prompt doc in `src/prompts.ts`. |
| `packages/db`                                                | New `src/schema/insights-cache.ts` exported from `src/schema/index.ts`; applied via `pnpm db:push`. **Reads** existing `applications` (stages/`stageChangedAt` from #2) and `evaluations` (score/band/family from #3) — no change to those. |
| `apps/web`                                                   | `app/api/insights/funnel/route.ts` (GET) + `app/api/insights/apply-floor/route.ts` (POST); `app/(dashboard)/insights/page.tsx`; `components/canvas/funnel-insights-card.tsx`; `case "getFunnelInsights"` in `hooks/use-canvas-sync.ts`; Zod schema in `lib/api-schemas.ts`. |
| `packages/jobs-api`                                          | (no change) — this epic is the user's own history only; Ever Jobs `/analyze` is out of scope.                                                                                                                          |
| `packages/ui`                                                 | (no change expected) — reuse `@ever-hust/ui/{card,badge,button,dialog}` + `cn()`; add a component only if a missing primitive surfaces.                                                                                 |
| `tests/e2e`                                                  | New `insights.spec.ts`.                                                                                                                                                                                                |

## 4. Dependencies

| Library                | Version  | Rationale                                                                                                  |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `zod`                  | existing | Typed funnel contract + inbound API validation (Articles 5 & 8). Already a workspace dep — no new dep.     |
| `drizzle-orm`          | existing | Join `applications` ↔ `evaluations`, new `insights_cache` table. Already in `packages/db`.                  |
| `ai` (Vercel AI SDK)   | existing | `tool({...})` definition for `getFunnelInsights`. Already in `packages/ai`.                                 |
| _(no new direct deps)_ | —        | Visualisations reuse the in-house bar/range primitives from `salary-insights-card.tsx` — no chart library. |

> Upstream epic dependencies (not libraries): **#5 structured-output** (the shared Zod-artifact
> contract this funnel object conforms to), **#3 evaluation engine** (provides `evaluations`
> score/band/family rows), **#2 applications-kanban** (provides application stages + `stageChangedAt`).
> **#6 guardrails** supplies the grounded/no-invent helpers for the auto-tune suggestion. This plan
> assumes those tables/contracts exist; if #2/#3 are not yet merged, Phase 2's `loadFunnelRows` join
> is blocked (see Risks).

## 5. Risks & Mitigations

| Risk                                                                                  | Likelihood | Impact | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `evaluations` (#3) or application stages/`stageChangedAt` (#2) not yet merged          | M          | H      | Phase 1 is fixture-only and unblocked; gate Phase 2 `loadFunnelRows` behind the upstream merge. Define the row shape as a typed seam so the join can be stubbed in tests until then. |
| Sparse history → misleading score floor / over-confident suggestion                    | M          | M      | Require a minimum `responded`+ sample before surfacing a floor; otherwise show "not enough data" (grounded, Article 7). Cover in unit tests. |
| Auto-tune perceived as silent automation                                               | L          | H      | Floor is a *soft default* written only on explicit user accept (Article 4); never a hard filter; show the before/after value on confirm. |
| Full-history scan slow for power users                                                 | L          | M      | Optional `insights_cache` (jsonb + `computedAt`) read-through; indexes on `applications(user_id)` already exist; cap rows scanned.    |
| Segment cardinality explosion (many tiny segments)                                     | L          | L      | Bucket comp range / score band into fixed bands; suppress segments below a min sample in the UI.                                      |
| Rate-limit / cost on the chat tool                                                     | L          | M      | Route gated by `applyRateLimit(userId, "authenticated")`; tool is read-only and cheap (no LLM-side fan-out, within `stepCountIs(5)`). |

## 6. Rollback Plan

Feature is additive and read-mostly. To disable: remove `getFunnelInsights` from the `tools` object
in `packages/ai/src/agents/orchestrator.ts` and unlink the `/insights` page from navigation — the
orchestrator and dashboard keep working. The `GET /api/insights/funnel` route can return 404 with no
data impact. The `insights_cache` table holds only derived rollups (recomputable from
`applications`+`evaluations`); dropping it loses nothing. The opt-in floor lives under
`users.preferences.evaluationFloor`; clearing that key reverts targeting to its prior defaults. No
core table is altered, so there is no destructive migration to reverse.

## 7. Migration Plan

`pnpm db:push` adds the new `insights_cache` table; it is empty on creation and populated lazily on
first read, so there is no backfill. Existing users with no application/evaluation history simply see
the empty-history guidance state. No change to `applications`, `evaluations`, or `users` columns —
the only `users` write is the additive `preferences.evaluationFloor` JSON key set on explicit opt-in,
which is absent (and treated as "no floor") for everyone until they accept a suggestion. No consumer
of existing tables changes behaviour.

## 8. Open Questions for Plan

- **Evaluation row source of truth:** does `evaluations` (#3) expose `band`/`jobFamily` directly, or
  do we derive band from a numeric `score` here? Affects `conversionBySegment` inputs. Confirm with #3
  before Phase 2.
- **Stage vocabulary:** the spec's funnel is `applied → responded → interview → offer/won`; confirm
  this matches the exact stage enum #2 writes to `applications` (and that `stageChangedAt` is the
  per-transition timestamp used for time-in-stage).
- **Floor write target:** `users.preferences.evaluationFloor` (single number) vs
  `evaluationWeights` (vector). Spec mentions both; start with a single floor and leave weights to a
  follow-up unless #3 already consumes a weight vector.
- **Minimum sample threshold** for surfacing a floor (e.g. ≥3 `responded`+ applications) — pick a
  default and record it in the spec's `## Decisions`.
