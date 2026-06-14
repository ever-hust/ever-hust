# Plan: 18 — Career-Growth Advisor

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

The Career-Growth Advisor turns rejection and low-fit data into a development loop. When a
seeker's history shows the **same gap closing the same doors** — a skill that keeps reducing
fit, an archetype that stays just out of reach — Hust surfaces prioritized, specific growth
actions (skills to learn, projects to build, certifications worth pursuing) tied directly to
the user's own evaluations, and can score a user-described portfolio project against the
target archetype ("does this move the needle?").

The data we need already exists. Epic #3 (evaluation engine) persists per-(user, job)
verdicts in the `evaluations` table; the recurring-gap signal lives in
`evaluations.blocks.cvMatch.gaps` (a `string[]`) plus `evaluations.archetype` /
`evaluations.jobFamily` / `evaluations.band`. Epic #8 (funnel analytics) defines the
rejection-pattern segments (conversion by band/family, the score floor). This epic adds **no
new evaluation logic** — it aggregates over what #3 and #8 already produced.

The work splits into three layers. First, a **pure, deterministic gap-aggregation module** in
`packages/ai` that reads the user's `evaluations` rows, clusters the free-text gap strings
into normalized gap groups, ranks them by frequency × fit-impact × archetype-recurrence, and
emits a typed `GapAggregate[]`. This layer is side-effect-free over an injected row set so it
is exhaustively unit-testable on fixtures (no DB, no LLM). Second, a **`careerAdvisor` tool**
(Vercel AI SDK v6 + Claude) that (a) loads the user's evaluation rows server-side, (b) runs
the aggregation, (c) asks the model — grounded strictly in those aggregates, never inventing —
to propose prioritized growth actions, and (d) optionally evaluates a user-supplied project
description against the dominant target archetype. Every artifact is emitted as a
**Zod-validated structured object** via the #5 contract (`defineArtifact` / `assertArtifact`
in `packages/ai/src/structured`) alongside the prose, so the result is queryable and
canvas-renderable. Third, the **Growth surface**: a new canvas overlay card (modeled on
`salary-insights-card.tsx`) wired through `useCanvasSync`, plus a dedicated "Growth" page
beside the funnel Insights page.

Per the constitution: this is **read-only over the user's own data** — it drafts advice and a
project verdict, it never enrols anyone in a course, never sends anything, never auto-acts
(Article 4). It is **grounded** — every recommended action must cite the gap/evaluation it
comes from; where there is insufficient history we say so rather than invent (Article 7).
`userId` is injected server-side by the orchestrator and is never an LLM-supplied parameter
(Article 8). All inbound strings are `.max()`-bounded (Article 8.3). It is standalone — the
only external dependency in the whole chain is the Ever Jobs API already used by sourcing;
this epic adds no new hard dependency and no Gauzy coupling (Article 2).

We persist a lightweight history of advisor runs in a new `growthPlans` table so the Growth
page can show "your plan over time" and the learning loop (#13) can later observe whether
closing a gap improved fit — but the table is optional to the live flow (the tool returns its
artifact regardless of whether the write succeeds), keeping the feature reversible.

The advisor is gated like other depth tools (interview prep, resume builder): the orchestrator
already passes `isSubscribed`, and the tool checks `users.subscriptionStatus ∈ {active,
past_due}` so free-tier users get a graceful upgrade nudge rather than a hard failure.

## 2. Phases

### Phase 1 — Gap aggregation (pure core)

- Goal: A deterministic, dependency-free function that turns a user's `evaluations` rows into
  a ranked `GapAggregate[]` (normalized gap label, frequency, affected archetypes/families,
  average fit-impact, representative job examples).
- Deliverables:
  - `packages/ai/src/career/gap-aggregation.ts` — `aggregateGaps(rows: EvaluationRowInput[]): GapAggregate[]` and helpers (gap-string normalization, clustering, ranking). No DB, no LLM, no I/O.
  - `packages/ai/src/career/types.ts` — `EvaluationRowInput`, `GapAggregate`, `GrowthAction` TS types (DX-only; runtime gate is the Zod artifact in Phase 2).
  - `packages/ai/src/career/gap-aggregation.test.ts` — fixture-driven unit tests (empty history, single gap, recurring gap across archetypes, tie-breaking, dedup of near-identical gap strings).
- Exit criteria: `pnpm test -- --selectProjects ai` green for the new suite; ranking is stable and documented; zero competitor references.

### Phase 2 — Structured artifact + `careerAdvisor` tool

- Goal: A registered AI tool that emits a Zod-validated growth-plan artifact (recommendations + optional project verdict), grounded in the Phase-1 aggregates.
- Deliverables:
  - `packages/ai/src/structured/schemas/growth-plan.ts` — `growthPlanArtifact` via `defineArtifact`, exporting `growthPlanSummarySchema` (ranked `gaps`, prioritized `actions` each citing its source gap + effort + impact, optional `projectVerdict`), `GROWTH_PLAN_SCHEMA_VERSION`.
  - Re-export from `packages/ai/src/structured/index.ts`.
  - `packages/ai/src/tools/career-advisor.ts` — `careerAdvisorTool = tool({ description, inputSchema: z.object({...}).max()-bounded, execute })`: loads `evaluations` for `userId` (injected), runs `aggregateGaps`, calls `runValidatedGeneration` to produce the artifact (grounded prompt), optionally scores a `projectDescription` against the dominant archetype, returns the plain validated object.
  - Subscription gate: tool checks `users.subscriptionStatus`; graceful upgrade message when free-tier.
  - Tests: `packages/ai/src/structured/schemas/growth-plan.test.ts` (schema accept/reject) and `packages/ai/src/tools/career-advisor.test.ts` (aggregation wiring, grounding/no-invent guard, empty-history path, project-verdict path) with mocked DB + model.
- Exit criteria: tool returns a schema-valid artifact for fixture history; rejects malformed model output; `pnpm test -- --selectProjects ai` green.

### Phase 3 — Registration, prompt, persistence

- Goal: Wire the tool into the orchestrator and system prompt, and persist advisor runs.
- Deliverables:
  - Export `careerAdvisorTool` from `packages/ai/src/tools/index.ts`; register `careerAdvisor` in the `tools: { ... }` object in `packages/ai/src/agents/orchestrator.ts` with server-side `userId` injection and the subscription check (mirroring `interviewPrep`/`resumeBuilder`).
  - Document the tool + when-to-use guidance in `packages/ai/src/prompts.ts` (`getOrchestratorPrompt`) and mirror in the Langfuse `orchestrator-system` prompt.
  - `packages/db/src/schema/growth-plans.ts` — `growthPlans` table (`id` identity PK; `userId` text ref `users.id` cascade; `summary` jsonb `$type<GrowthPlanSummaryRow>`; `archetype` text; `createdAt`); index on `userId`. Export from `packages/db/src/schema/index.ts`; apply with `pnpm db:push`.
  - The tool best-effort persists each run to `growthPlans` (failure to write does not fail the tool).
  - Prompt-doc test update in `packages/ai/src/prompts.test.ts`.
- Exit criteria: orchestrator constructs with the new tool; prompt documents it; `pnpm db:push` applies the table; `pnpm test -- --selectProjects ai` and `--selectProjects db` green.

### Phase 4 — Canvas sync + Growth UI

- Goal: Surface the growth-plan artifact in the canvas and on a dedicated Growth page.
- Deliverables:
  - `apps/web/components/canvas/growth-plan-card.tsx` — overlay card (modeled on `salary-insights-card.tsx`): ranked gaps, prioritized actions (each tagged effort/impact and the gap it closes), and the project verdict when present.
  - Add `case "careerAdvisor"` to `handleToolResult` in `apps/web/hooks/use-canvas-sync.ts` (new `growthPlan` canvas-state field + `clearGrowthPlan`), and render the card in `apps/web/components/canvas/jobs-canvas.tsx` / `dashboard-canvas.tsx`.
  - `apps/web/app/(dashboard)/growth/page.tsx` — Growth page listing current gaps → recommended actions (reads `growthPlans` / triggers the advisor), placed beside the funnel Insights page; sidebar link in `apps/web/components/layout/`.
  - API route `apps/web/app/api/growth/route.ts` — `requireSessionUser()` + `applyRateLimit(userId, "authenticated")` + Zod body from `apps/web/lib/api-schemas.ts`, errors via `apiBadRequest()`/`apiError()`.
- Exit criteria: card renders for a fixture artifact; Growth page loads under auth; lint + type-check green.

### Phase 5 — E2E + verification

- Goal: Prove the user-visible flow end to end and keep CI green.
- Deliverables:
  - `tests/e2e/growth.spec.ts` — Playwright: a user with seeded recurring-gap history opens the Growth page / asks the assistant for growth advice and sees prioritized, gap-cited actions; free-tier user sees the upgrade nudge (no advisor output, no auto-action).
  - Run `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e`; Article-11 competitor grep over the diff.
- Exit criteria: full CI suite green on `develop`; `ROADMAP.md` progress updated; zero competitor references.

## 3. Packages Touched

| Package                                                                | Change                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/ai/src/career/`                                              | new: `gap-aggregation.ts`, `types.ts` + `*.test.ts` (pure gap-aggregation core)                              |
| `packages/ai/src/tools/career-advisor.ts`                             | new `careerAdvisorTool`; export from `packages/ai/src/tools/index.ts`                                         |
| `packages/ai/src/agents/orchestrator.ts`                              | register `careerAdvisor` in `tools: {}` with server-side `userId` injection + subscription gate              |
| `packages/ai/src/structured/schemas/growth-plan.ts`                  | new `growthPlanArtifact` (Zod, #5 contract); re-export from `packages/ai/src/structured/index.ts`            |
| `packages/ai/src/prompts.ts`                                          | document `careerAdvisor` in `getOrchestratorPrompt`; mirror in Langfuse `orchestrator-system`               |
| `packages/db/src/schema/growth-plans.ts`                             | new `growthPlans` table; export from `packages/db/src/schema/index.ts`; `pnpm db:push`                       |
| `apps/web/hooks/use-canvas-sync.ts`                                  | add `case "careerAdvisor"` + `growthPlan` state field + `clearGrowthPlan`                                     |
| `apps/web/components/canvas/growth-plan-card.tsx`                    | new overlay card (template: `salary-insights-card.tsx`); rendered in `jobs-canvas.tsx`/`dashboard-canvas.tsx`|
| `apps/web/app/(dashboard)/growth/page.tsx`                           | new Growth page; sidebar link in `apps/web/components/layout/`                                                |
| `apps/web/app/api/growth/route.ts`                                  | new route (`requireSessionUser`, `applyRateLimit`, Zod, `api-response` helpers)                              |
| `apps/web/lib/api-schemas.ts`                                        | add growth request schema                                                                                     |
| `packages/jobs-api`                                                  | (no change) — Ever Jobs API untouched; advisor reads Hust-owned `evaluations`                                |
| `tests/e2e/growth.spec.ts`                                           | new Playwright spec                                                                                           |

## 4. Dependencies

| Library            | Version | Rationale                                                                                          |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| `ai` (Vercel SDK)  | in-repo | Already used; `tool()` + `runValidatedGeneration` for the artifact. No new dep.                    |
| `zod`              | in-repo | Already used; artifact schema + `.max()`-bounded tool input. No new dep.                           |
| `drizzle-orm`      | in-repo | Already used; `growthPlans` schema + read of `evaluations`. No new dep.                            |
| (none new)         | —       | This epic adds **no new direct dependency** (Article 10.5).                                        |

Upstream **epic** dependencies (not libraries):

- **#5 structured-output** — the shared artifact contract (`defineArtifact`/`assertArtifact`, `runValidatedGeneration`); the growth-plan artifact is built on it.
- **#3 evaluation engine** — supplies `evaluations.blocks.cvMatch.gaps`, `archetype`, `jobFamily`, `band`, `score`; the gap source. (Hard prerequisite — already landed.)
- **#8 funnel analytics** — supplies rejection-pattern segments / score-floor framing the advisor references. (Spec's declared `Depends on`.)
- **#6 guardrails** — grounding/no-invent helpers re-used so recommendations never fabricate.

## 5. Risks & Mitigations

| Risk                                                                       | Likelihood | Impact | Mitigation                                                                                                           |
| -------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| Sparse history → low-signal or generic advice                              | M          | M      | Aggregation returns empty when below a minimum gap-recurrence threshold; tool surfaces "not enough history yet" rather than inventing (Article 7). E2E covers the empty path. |
| LLM invents skills/courses not grounded in the user's gaps                 | M          | H      | Prompt is grounded strictly in `GapAggregate[]`; #6 guardrails + `assertArtifact` reject ungrounded output; unit test asserts every action cites a source gap.              |
| Free-text gap strings cluster poorly (same gap, different wording)         | M          | M      | Normalization + near-duplicate merge in `gap-aggregation.ts`, fixture-tested; ranking tolerant of residual noise.   |
| Advice nudges quantity over quality (steer to "apply more")                | L          | M      | By design the advisor recommends *development*, not more applications (Article 3); copy + tests assert action types are skill/project/cert, not "apply".                    |
| New table migration on shared DB                                           | L          | M      | `growthPlans` is additive and optional to the live flow; `pnpm db:push` is idempotent; rollback = drop table, no data loss to existing tables.                              |
| Tool added without subscription gate → free-tier cost blowout              | L          | M      | Gate mirrors `interviewPrep`/`resumeBuilder` (`subscriptionStatus`), tested; graceful upgrade message.              |

## 6. Rollback Plan

The feature is reversible with no data loss to existing tables:

1. **Disable surface:** remove the `careerAdvisor` registration from the `tools: {}` object in `orchestrator.ts` and remove the Growth sidebar link — the assistant can no longer invoke the advisor; everything else is unaffected.
2. **Hide the page:** the `growth/page.tsx` route and `/api/growth` route can be removed independently; `use-canvas-sync.ts` falls back to the `default` switch branch (already a no-op + dev log) for an unknown `careerAdvisor` result.
3. **Drop persistence:** the `growthPlans` table is additive and referenced only by this feature; dropping it does not touch `users`, `jobs`, `evaluations`, or any existing table.

No env var or external service is introduced, so there is nothing to deconfigure.

## 7. Migration Plan (if applicable)

- **Schema:** one additive table, `growthPlans`, applied via `pnpm db:push`. No backfill — rows are created on demand as users run the advisor. No existing column changes; no data transformation.
- **Consumers:** no existing consumer reads `growthPlans`; the learning loop (#13) may later read it but is out of scope here.
- **Prompt:** the Langfuse `orchestrator-system` prompt gains a `careerAdvisor` section; the local fallback in `prompts.ts` is updated in the same change so behaviour is identical whether or not Langfuse is reachable.

## 8. Open Questions for Plan

- **Project-evaluator scope:** does the project verdict score against the single dominant target archetype, or against the top-N archetypes the user is pursuing? (Plan assumes dominant archetype for v1; multi-archetype deferred.)
- **Persistence cadence:** persist every advisor run, or only when the user explicitly "saves" a growth plan? (Plan assumes best-effort persist of every run; revisit if `growthPlans` grows noisy.)
- **Minimum-history threshold:** what gap-recurrence count flips the advisor from "not enough history" to actionable? (Plan assumes ≥2 occurrences of a normalized gap; tune on fixtures.)
- **Funnel coupling depth:** consume #8's computed score-floor/segment rollups directly, or re-derive the rejection patterns locally from `evaluations`/`applications`? (Plan assumes local derivation over `evaluations` to avoid a hard ordering dependency on #8's cache.)
