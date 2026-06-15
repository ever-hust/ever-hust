# Spec #18 — Career-Growth Advisor

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: M · Phase 3 · Depends on: [#8](../08-funnel-analytics/spec.md) (gap source)

## 1. Problem & user value

When the funnel ([#8](../08-funnel-analytics/spec.md)) and evaluations ([#3](../03-evaluation-engine/spec.md))
reveal recurring **gaps** (a skill that keeps reducing fit, roles just out of reach), Hust can
advise growth: targeted skills, projects, or training to close the gap — turning rejection data
into a development loop.

## 2. Scope

**In:** gap detection from #3 CV-match gaps + #8 rejection patterns; recommended
skills/projects/certifications to close them; a portfolio-project evaluator ("does this project
move the needle?"). **Out:** delivering courses; cross-user benchmarking.

## 3. Design

- A `careerAdvisor` tool: aggregates recurring gaps (from `evaluations.blocks.cvMatch.gaps` + funnel
  segments), proposes prioritized growth actions, and can evaluate a user-described project against
  the target archetype. Structured artifact (#5).
- Surfaces on an "Insights/Growth" page beside the funnel.

## 4. Plan & tasks

1. Gap aggregation (from #3 gaps + #8 patterns) — pure, unit-tested.
2. `careerAdvisor` tool (recommendations + project evaluator; #5 artifact).
3. Growth page UI (gaps → recommended actions).
4. Tests: gap aggregation, recommendation structure.

## 5. Acceptance

- A user with recurring gaps gets prioritized, specific growth actions tied to their evaluations;
  CI green; **zero competitor references**.

## Implementation (shipped)

- **Gap aggregation** — `packages/ai/src/analytics/gaps.ts`: pure `aggregateGaps()` that rolls up
  recurring CV-match gaps (case-insensitive, frequency-ranked, capped). Unit-tested in
  `packages/ai/src/analytics/gaps.test.ts`.
- **Structured artifact** — `packages/ai/src/structured/schemas/career-growth.ts`: the
  `career_growth` artifact (built on the #5 contract via `defineArtifact`), with
  `growthRecommendationSchema` (type skill/project/certification/experience + priority + rationale),
  `recurringGapSchema`, and the LLM-output schema. Tested in `career-growth.test.ts`.
- **AI tool** — `packages/ai/src/tools/career-advisor.ts` exports `careerAdvisorTool`; reads the
  user's evaluations, aggregates gaps, then generates a validated growth plan. Tested in
  `career-advisor.test.ts`.
- **Orchestrator wiring** — registered as the `careerAdvisor` tool in
  `packages/ai/src/agents/orchestrator.ts` (`userId` + `model` injected server-side).
- **Package exports** — `careerAdvisorTool` re-exported from `packages/ai/src/index.ts` and
  `packages/ai/src/tools/index.ts`; artifact schema from `packages/ai/src/structured/index.ts`.
- **Data source** — recurring gaps read from the `evaluations` table's `blocks.cvMatch.gaps`
  (schema `packages/db/src/schema/evaluations.ts`); no new table required for this epic.
- **Canvas surfacing** — the growth plan is surfaced as an artifact card via the `careerAdvisor`
  case in `apps/web/hooks/use-canvas-sync.ts` (title "Growth Plan").
- **Project evaluator** — the "does this project move the needle?" evaluation is handled within the
  same `careerAdvisor` tool/LLM prompt rather than a separate tool.
- **Deferred** — a dedicated standalone "Insights/Growth" page route beside the funnel was not
  built; the plan renders in the chat canvas artifact instead. No separate REST API route was
  added (the tool runs inside the AI chat orchestrator).
