# Spec #8 — Funnel & Rejection-Pattern Analytics

> Status: Draft · Owner: Hust · Effort: L · Phase 2 · Depends on: [#3](../03-evaluation-engine/spec.md), [#5](../05-structured-output/spec.md), [#2](../02-applications-kanban/spec.md)

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
