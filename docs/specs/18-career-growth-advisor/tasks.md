# Tasks: 18 — Career-Growth Advisor

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Gap aggregation (pure core)

- [ ] T01 — Define career-advisor TS types
  - **Files:** `packages/ai/src/career/types.ts`
  - **Acceptance:**
    - Exports `EvaluationRowInput` (subset of an `evaluations` row: `jobId`, `score`, `band`, `archetype`, `jobFamily`, `blocks.cvMatch.gaps`), `GapAggregate` (normalized `label`, `frequency`, `affectedArchetypes`, `affectedFamilies`, `avgFitImpact`, `exampleJobIds`), `GrowthAction` (`type: "skill"|"project"|"certification"`, `title`, `sourceGapLabel`, `effort`, `impact`).
    - DX-only types; no runtime imports of Zod, DB, or AI SDK. `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T02 — Implement pure `aggregateGaps` + tests
  - **Files:** `packages/ai/src/career/gap-aggregation.ts`, `packages/ai/src/career/gap-aggregation.test.ts`
  - **Acceptance:**
    - `aggregateGaps(rows: EvaluationRowInput[]): GapAggregate[]` is pure (no DB, no LLM, no I/O); normalizes/merges near-duplicate gap strings; ranks by frequency × fit-impact × archetype-recurrence; applies a minimum-recurrence threshold (≥2) so one-off gaps are dropped.
    - Tests cover: empty history → `[]`; single non-recurring gap → dropped; recurring gap across two archetypes → ranked first; near-identical gap wording merged; deterministic tie-break.
    - `pnpm test -- --selectProjects ai --testPathPattern gap-aggregation` green.
  - **Estimate:** 1 day

## Phase 2 — Structured artifact + `careerAdvisor` tool

- [ ] T03 — Growth-plan structured artifact (#5 contract) + tests
  - **Files:** `packages/ai/src/structured/schemas/growth-plan.ts`, `packages/ai/src/structured/schemas/growth-plan.test.ts`, `packages/ai/src/structured/index.ts`
  - **Acceptance:**
    - `growthPlanArtifact` defined via `defineArtifact`; exports `growthPlanSummarySchema` (`gaps: GapAggregate[]`, `actions: GrowthAction[]` where every action's `sourceGapLabel` must match a listed gap, optional `projectVerdict: { movesTheNeedle: boolean; rationale; alignedArchetype }`) and `GROWTH_PLAN_SCHEMA_VERSION`.
    - All string/array fields `.max()`-bounded (Article 8.3). Re-exported from `structured/index.ts`.
    - Tests assert valid object passes `assertArtifact`; an action citing a non-existent gap and an over-length string both reject.
    - `pnpm test -- --selectProjects ai --testPathPattern growth-plan` green.
  - **Estimate:** 1 day

- [ ] T04 — Implement `careerAdvisorTool` (grounded, subscription-gated)
  - **Files:** `packages/ai/src/tools/career-advisor.ts`
  - **Acceptance:**
    - `careerAdvisorTool = tool({ description, inputSchema, execute })`; `inputSchema` is `z.object({ projectDescription: z.string().max(4000).optional() })` (no `userId` param — injected by orchestrator).
    - `execute({ userId, projectDescription })`: reads `evaluations` for `userId` via `db` (`@ever-hust/db`), runs `aggregateGaps`, calls `runValidatedGeneration` against `growthPlanArtifact` with a prompt grounded strictly in the aggregates (no invented skills/courses), and optionally scores `projectDescription` against the dominant archetype.
    - Empty/low history → returns a plain object signalling "not enough history" (no fabricated actions).
    - Subscription gate: free-tier (`subscriptionStatus` not in `active`/`past_due`) returns a graceful upgrade object, not a throw.
    - Returns the validated plain object (canvas-shaped). No auto-action, no external send (Article 4).
  - **Estimate:** 1 day

- [ ] T05 — `careerAdvisorTool` unit tests
  - **Files:** `packages/ai/src/tools/career-advisor.test.ts`
  - **Acceptance:**
    - Mocks `db` + the model. Covers: recurring-gap fixture → schema-valid artifact with each action citing a real gap; empty history → "not enough history" path; project-verdict path returns aligned archetype; free-tier → upgrade object; model returning an ungrounded action → rejected by `assertArtifact`.
    - `pnpm test -- --selectProjects ai --testPathPattern career-advisor` green.
  - **Estimate:** 1 day

## Phase 3 — Registration, prompt, persistence

- [ ] T06 — Export + register the tool in the orchestrator
  - **Files:** `packages/ai/src/tools/index.ts`, `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `careerAdvisorTool` exported from `tools/index.ts` and imported in `orchestrator.ts`.
    - `careerAdvisor` added to the `tools: { ... }` object inside `streamText`, injecting `userId` server-side and applying the subscription check (pattern mirrors `interviewPrep`/`resumeBuilder`); `stopWhen: stepCountIs(5)` unchanged.
    - `pnpm test -- --selectProjects ai --testPathPattern orchestrator` green; `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T07 — Document `careerAdvisor` in the system prompt
  - **Files:** `packages/ai/src/prompts.ts`, `packages/ai/src/prompts.test.ts`
  - **Acceptance:**
    - `getOrchestratorPrompt` text describes `careerAdvisor` (what it does, when to call it, that it drafts development advice — never "apply more", never auto-acts) alongside the existing tool docs.
    - Mirror the same section into the Langfuse `orchestrator-system` prompt (note in PR; local fallback is source of truth).
    - `prompts.test.ts` asserts the prompt mentions `careerAdvisor`; `pnpm test -- --selectProjects ai --testPathPattern prompts` green.
  - **Estimate:** 0.5 day

- [ ] T08 — Add `growthPlans` table + export
  - **Files:** `packages/db/src/schema/growth-plans.ts`, `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table follows house style: `id` integer identity PK; `userId` text `.notNull().references(() => users.id, { onDelete: "cascade" })`; `archetype` text; `summary` jsonb `.$type<GrowthPlanSummaryRow>().notNull()`; `createdAt` timestamp `.notNull().defaultNow()`; `index("growth_plans_user_id_idx").on(table.userId)`.
    - Exported from `schema/index.ts` (table + row type).
    - `pnpm check-types` green; `pnpm test -- --selectProjects db` green.
  - **Estimate:** 0.5 day

- [ ] T09 — Apply schema with `pnpm db:push` + best-effort persist
  - **Files:** `packages/db/src/schema/growth-plans.ts`, `packages/ai/src/tools/career-advisor.ts` (persist call)
  - **Acceptance:**
    - `pnpm db:push` applies `growth_plans` to the dev DB (idempotent; no existing-table changes).
    - `careerAdvisorTool` best-effort inserts each run into `growthPlans`; a write failure is caught and does **not** fail the tool (artifact still returned). Covered by an added case in `career-advisor.test.ts`.
  - **Estimate:** 0.5 day

## Phase 4 — Canvas sync + Growth UI

- [ ] T10 — Wire canvas sync for `careerAdvisor`
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - `CanvasState` gains `growthPlan: GrowthPlanData | null`; `handleToolResult` gains `case "careerAdvisor"` that sets it (guarding the empty-history/upgrade shapes); a `clearGrowthPlan` callback is exported.
    - Unknown-tool `default` branch unchanged. `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T11 — Growth-plan canvas card
  - **Files:** `apps/web/components/canvas/growth-plan-card.tsx`, `apps/web/components/canvas/jobs-canvas.tsx`, `apps/web/components/canvas/dashboard-canvas.tsx`
  - **Acceptance:**
    - New `GrowthPlanCard` (template: `salary-insights-card.tsx`) renders ranked gaps, prioritized actions (each tagged effort/impact + the gap it closes), and the project verdict when present; uses `@ever-hust/ui/card`/`badge` + `cn()`; renders an empty/upgrade state.
    - Card mounted in `jobs-canvas.tsx`/`dashboard-canvas.tsx` when `growthPlan` is set, with dismiss via `clearGrowthPlan`.
    - `pnpm lint` and `pnpm check-types` green.
  - **Estimate:** 1 day

- [ ] T12 — Growth page + API route
  - **Files:** `apps/web/app/(dashboard)/growth/page.tsx`, `apps/web/app/api/growth/route.ts`, `apps/web/lib/api-schemas.ts`, `apps/web/components/layout/` (sidebar link)
  - **Acceptance:**
    - `/growth` page (under `requireSessionUser` auth) lists current gaps → recommended actions beside the funnel Insights page; sidebar gains a Growth link.
    - `/api/growth` uses `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, a Zod body schema in `api-schemas.ts`, and `apiBadRequest()`/`apiError()` from `api-response.ts`.
    - Page renders for a fixture artifact; `pnpm lint` + `pnpm check-types` green.
  - **Estimate:** 1 day

## Phase 5 — E2E + verification

- [ ] T13 — Playwright E2E for the Growth flow
  - **Files:** `tests/e2e/growth.spec.ts`, `tests/e2e/fixtures/`
  - **Acceptance:**
    - Seeds a user with recurring-gap `evaluations`; opening `/growth` (or asking the assistant for growth advice) shows prioritized, gap-cited actions and no auto-action.
    - A free-tier user sees the upgrade nudge and no advisor output.
    - `pnpm test:e2e --grep growth` green against `http://localhost:8443`.
  - **Estimate:** 1 day

- [ ] T14 — Full CI gate + competitor self-check + roadmap
  - **Files:** `docs/specs/ROADMAP.md`
  - **Acceptance:**
    - `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e` all green.
    - Article-11 grep over the diff returns **zero** competitor references.
    - `ROADMAP.md` marks epic #18 progress.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- `userId` is injected server-side by the orchestrator — it is never an LLM-supplied tool param.
- The advisor **drafts only** — it never enrols, sends, or auto-acts (Article 4); recommendations must be grounded in real gaps (Article 7).
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
