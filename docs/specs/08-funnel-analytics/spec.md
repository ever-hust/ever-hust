# Spec #8 — Funnel & Rejection-Pattern Analytics

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: L · Phase 2 · Depends on: [#3](../03-evaluation-engine/spec.md), [#5](../05-structured-output/spec.md), [#2](../02-applications-kanban/spec.md)

## 1. Problem & user value

Once applications carry **stages** (#2) and jobs carry **scores** (#3), Hust can show a seeker how
their search is actually performing and **auto-tune targeting**: conversion by segment, where
they stall, and the empirical **score floor** below which nothing ever converts. This turns the
pipeline into a self-improving advisor ("stop applying below 3.8 — none have ever responded").

## 2. Scope

**In:** a funnel (applied → responded → interview → offer/won) with **conversion by segment**
(score band, job family, source, comp range, remote); a derived **score floor** ("lowest score
that ever reached responded+"); rejection-pattern insights that feed back into search/evaluation
defaults.

**Out:** the cross-user/market analytics (that's Ever Jobs `/analyze`, harvested in
[#1](../01-harvest-ever-jobs/spec.md)) — this is **this user's** history only.

## 3. Design

- Aggregate over `applications` (stages, `stageChangedAt`) joined to `evaluations` (score, band,
  family) — all already persisted via #2/#3/#5.
- Compute, per user: stage conversion rates, time-in-stage, conversion **by segment**, and the
  **score floor** (min score among applications that reached `responded`+).
- **Auto-tune (opt-in):** surface "raise your fit threshold to X" and feed it as a soft default
  into the search/evaluation weighting (never silently; the user accepts).
- Charts via the existing admin charting (Recharts) reused on a user "Insights" page.

## 4. Data / API

- No new core tables (reads `applications` + `evaluations`); optional `insights_cache` (jsonb +
  `computedAt`) for expensive rollups. A `getFunnelInsights` tool/route.

## 5. Plan & tasks

1. Pure aggregation functions (conversion, time-in-stage, by-segment, score floor) — unit-tested
   on fixtures.
2. `getFunnelInsights` route/tool (+ optional cache).
3. "Insights" page (funnel + segment breakdown + score-floor callout).
4. Opt-in "apply this threshold" → writes `users.preferences.evaluationWeights`/floor.
5. Tests: aggregation math (unit), score-floor edge cases, E2E insights render.

## 6. Acceptance

- Funnel + by-segment conversion + score floor render for a user with fixture history; accepting
  the suggested floor updates preferences; aggregation is unit-tested; CI green; **zero competitor
  references**.

## Implementation (shipped)

Shipped as a leaner, chat-first slice: the funnel is computed by a pure function and surfaced
conversationally through an orchestrator AI tool. The standalone Insights page, REST route, cache
table, and opt-in auto-tune from the original plan are **deferred** (see below).

- **Aggregation core:** `packages/ai/src/analytics/funnel.ts` — `computeFunnel(rows)` (pure, no
  I/O): per-stage counts, conversion rates (`applied → screening → interviewing → offer` +
  `overallOfferRate`), `avgScore`, and `avgScoreByOutcome` (offer vs rejected) as the
  score-vs-outcome signal.
- **Unit tests:** `packages/ai/src/analytics/funnel.test.ts` (aggregation math / edge cases).
- **AI tool:** `packages/ai/src/tools/funnel-analytics.ts` — `funnelAnalyticsTool`; reads **this
  user's** `applications` (`pipelineStage`) left-joined to `evaluations` (`score`) on
  `(userId, jobId)`, then calls `computeFunnel`. `userId` is injected server-side, never from tool
  input.
- **Tool tests:** `packages/ai/src/tools/funnel-analytics.test.ts`.
- **Tool export:** `packages/ai/src/tools/index.ts` (`funnelAnalyticsTool`).
- **Orchestrator registration:** `packages/ai/src/agents/orchestrator.ts` — registered as the
  `funnelAnalytics` tool with the server-side `userId`-injection wrapper.
- **System prompt:** `packages/ai/src/prompts.ts` documents `funnelAnalytics` under the
  orchestrator's capabilities.
- **Stage taxonomy reused:** `packages/ai/src/pipeline/stages.ts` (`PipelineStage`); reads existing
  tables `applications` (`packages/db/src/schema/applications.ts`, column `pipeline_stage`) and
  `evaluations` (`packages/db/src/schema/evaluations.ts`, column `score`) — **no new tables**.

**Persisted snapshots (shipped):** `funnel_snapshots` table (`packages/db/src/schema/funnel-snapshots.ts`,
migration `0003`) + the `funnel-snapshots` scheduled Trigger.dev task
(`packages/triggers/src/funnel-snapshots.ts`, `processFunnelSnapshots`, daily 02:00 UTC) compute each
user's funnel and persist a row — turning the on-demand funnel into a **time series**. Read via
`GET /api/user/funnel/history` (authed; covered by `tests/e2e/authed/funnel-history.authed.spec.ts`).

**Still deferred:**
- Conversion **by segment** (score band / family / source / comp / remote), time-in-stage, and the
  empirical **score floor** / opt-in "apply this threshold" auto-tune.
- No `/insights` dashboard page / `FunnelInsightsCard` yet — history is exposed via the API + chat tool.
