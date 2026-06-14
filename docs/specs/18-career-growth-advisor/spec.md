# Spec #18 — Career-Growth Advisor

> Status: Draft · Owner: Hust · Effort: M · Phase 3 · Depends on: [#8](../08-funnel-analytics/spec.md) (gap source)

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
