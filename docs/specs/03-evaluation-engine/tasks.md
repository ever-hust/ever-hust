# Tasks: 03 — Evaluation Engine (`evaluateJob`) — KEYSTONE

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

> Tests are written **alongside** each implementation task, never batched. Verify **zero
> competitor references** before every commit (constitution Article 11). Depends on
> [#5 structured-output](../05-structured-output/spec.md) (shared `Artifact` contract) and
> inherits [#6 guardrails](../06-guardrails/spec.md) (no-invent, honest `not_recommended`,
> cost caps). Standalone-first: only the Ever Jobs API (already synced into `jobs`) is required.

## Phase 1 — Data spine (table + taxonomy/weights config)

- [ ] T01 — Create the `evaluations` table
  - **Files:** `packages/db/src/schema/evaluations.ts` (new); export in
    `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - `integer("id").primaryKey().generatedAlwaysAsIdentity()`; `userId` text FK → `users.id`
      `onDelete: "cascade"`; `jobId` integer FK → `jobs.id` `onDelete: "cascade"`.
    - `score` integer (0–100); `band` text enum `["apply_now","worth_it","specific_reason","not_recommended"]`;
      `jobFamily` / `archetype` text; `dimensions` jsonb `$type<…>()`; `blocks` jsonb `$type<…>()`;
      `modelUsed` text; `weightsUsed` jsonb; `createdAt`/`updatedAt` `timestamp().notNull().defaultNow()`.
    - Unique `(userId, jobId)`; indexes `evaluations_user_band_idx` on `(userId, band)` and
      `evaluations_user_score_idx` on `(userId, score)`.
    - Exported from `schema/index.ts`; `pnpm check-types` passes.
  - **Estimate:** 0.5 day

- [ ] T02 — Create the `job_family_config` taxonomy table + org override key
  - **Files:** `packages/db/src/schema/job-family-config.ts` (new); export in
    `packages/db/src/schema/index.ts`; `packages/db/src/schema/org-ai-config.ts` (add
    optional `evaluationConfig` jsonb key)
  - **Acceptance:**
    - `job_family_config` holds family → archetype keyword packs as jsonb (`$type<{ family:
      string; archetypes: { name: string; keywords: string[] }[] }>()`), with an `isActive`
      boolean and timestamps, matching house style.
    - `organizationAiConfigs` gains an additive `evaluationConfig` jsonb key (`$type<{ weights?:
      Record<string,number>; taxonomy?: ... }>()`); no existing column removed.
    - `pnpm check-types` passes; both exported from `schema/index.ts`.
  - **Estimate:** 0.5 day

- [ ] T03 — Push schema + seed the taxonomy
  - **Files:** run `pnpm db:push`; `packages/db/src/seed/evaluation-taxonomy.ts` (new) wired
    into `pnpm db:seed`
  - **Acceptance:**
    - `pnpm db:push` applies `evaluations` + `job_family_config` cleanly (no destructive diff).
    - Seed populates `job_family_config` with the spec §3.1 families (Software Eng, Data/ML,
      Design, Product, Sales, Marketing, Ops/Other) and their illustrative keyword packs.
    - Re-running the seed is idempotent (upsert on family).
  - **Estimate:** 0.5 day

- [ ] T04 — Schema unit tests
  - **Files:** `packages/db/src/schema/__tests__/evaluations.test.ts` (new),
    `packages/db/src/schema/__tests__/job-family-config.test.ts` (new)
  - **Acceptance:**
    - Tests assert column presence, the `band` enum values, unique `(userId, jobId)`, and the
      two indexes via the Drizzle table metadata.
    - Green under `pnpm test -- --selectProjects db`; no network.
  - **Estimate:** 0.5 day

## Phase 2 — Deterministic scoring core (no LLM)

- [ ] T05 — Default weight matrix + `mergeWeights`
  - **Files:** `packages/ai/src/evaluation/weights.ts` (new);
    `packages/ai/src/evaluation/weights.test.ts` (new)
  - **Acceptance:**
    - Default 10-dimension matrix matches spec §3.2 (North Star 25, CV match 15, Level 15,
      Comp 10, Growth 10, Remote 5, Reputation 5, Tech 5, Speed 5, Culture 5).
    - `mergeWeights({ override, user, org })` merges in order **override → user → org → default**,
      validates the result sums to 100, and **falls back to default** on an invalid set (never
      throws to the user).
    - Tests cover: default sums 100; user override; org override; one-off `weightOverride`;
      invalid (sum≠100 / negative) → default fallback.
  - **Estimate:** 1 day

- [ ] T06 — Job-family → archetype detection
  - **Files:** `packages/ai/src/evaluation/taxonomy.ts` (new);
    `packages/ai/src/evaluation/taxonomy.test.ts` (new)
  - **Acceptance:**
    - `detectJobFamily(jobText, cv, prefs, packs)` returns `{ jobFamily, archetype }` from
      keyword signals (JD + CV/preferences); deterministic, no LLM, no network.
    - Tests assert correct family/archetype for at least an SRE JD and a Field Marketing JD
      (distinct families) plus an ambiguous JD falling back to `Ops / Other`.
  - **Estimate:** 1 day

- [ ] T07 — Deterministic dimensions (Comp / Remote / Level / CV-baseline)
  - **Files:** `packages/ai/src/evaluation/deterministic.ts` (new);
    `packages/ai/src/evaluation/deterministic.test.ts` (new); reuses
    `packages/ai/src/tools/salary-helpers.ts` (`annualise`)
  - **Acceptance:**
    - `computeDeterministicDimensions(job, user)` returns 4 dims each with `key`, `weight`,
      `score5` (1–5), `rationale`, `source: "deterministic"`.
    - Comp uses annualized `jobs.salaryMin/Max` + `salaryInterval` vs the user's target; Remote
      uses `jobs.isRemote` vs preference; Level uses `jobs.jobLevel` vs user level; CV-baseline
      is skills overlap from `cvParsedData`.
    - Missing data degrades gracefully (e.g. comp `budgetFit: "unknown"`) — never invents.
    - Tests run without the LLM and cover present/missing salary, remote match/mismatch, and
      skills-overlap edges.
  - **Estimate:** 1 day

- [ ] T08 — Weighted score + 1–5 mirror + band assignment
  - **Files:** `packages/ai/src/evaluation/score.ts` (new);
    `packages/ai/src/evaluation/score.test.ts` (new)
  - **Acceptance:**
    - `computeScore(dimensions, weights)` → `{ score (0–100), score5 (1–5), band }`.
    - Band cutoffs match spec §3.3: `apply_now` ≥4.5, `worth_it` 4.0–4.4, `specific_reason`
      3.5–3.9, `not_recommended` <3.5.
    - Tests assert each band boundary exactly (4.5 / 4.0 / 3.5) and the 0–100 ↔ 1–5 mapping.
  - **Estimate:** 0.5 day

## Phase 3 — LLM layer + structured output + tool

- [ ] T09 — Evaluation machine-summary schema (#5 contract)
  - **Files:** `packages/ai/src/structured/schemas/evaluation.ts` (new, or consume from #5);
    `packages/ai/src/structured/schemas/evaluation.test.ts` (new)
  - **Acceptance:**
    - `EvaluationSummary` Zod schema mirrors spec §4.1 (`jobId`, `score`, `score5`, `band`,
      `jobFamily`, `archetype`, `dimensions[]`, `blocks{A–F}`, `recommendation`), `schemaVersion = 1`.
    - Returned as `Artifact<"evaluation", EvaluationSummary>` per #5; if #5 has not landed, a
      thin local `Artifact`/`assertArtifact` shim is added with a `TODO` to switch to #5's module.
    - Tests: valid parse, invalid reject, version field present.
  - **Estimate:** 0.5 day

- [ ] T10 — `evaluateJob` tool (deterministic core + `generateObject` + upsert)
  - **Files:** `packages/ai/src/tools/evaluate-job.ts` (new);
    `packages/ai/src/tools/__tests__/evaluate-job.test.ts` (new)
  - **Acceptance:**
    - `tool({ description, inputSchema, execute })`; `inputSchema = z.object({ jobId, weightOverride?,
      includeInterviewPlan: z.boolean().default(false) }).max()`-bounded; **`jobId` is the integer
      `jobs.id`** (see plan Open Question 1); `userId` is NOT in the input schema.
    - `execute` reads the `jobs` row + `users.cvParsedData` + `users.preferences`, runs the
      deterministic core (T05–T08), passes deterministic dims as **fixed facts** into
      `generateObject({ schema: EvaluationSummary })` for the LLM dims + A–F blocks, assembles the
      `Artifact`, validates via `assertArtifact`, and **upserts** the `evaluations` row
      (`onConflictDoUpdate` on `(userId, jobId)`).
    - Block F is produced only when `includeInterviewPlan` is true.
    - Returns the validated `evaluationResult` (structured object, per Article 5).
    - Tests (LLM mocked): deterministic dims marked `source:"deterministic"`; upsert path called;
      a bad-fit fixture yields `band: not_recommended` with a non-empty reason; invalid LLM output
      is retried then safely handled (no throw to user).
  - **Estimate:** 1 day

- [ ] T11 — Free-tier evaluation cap
  - **Files:** `packages/ai/src/rate-limit.ts` (add `checkEvaluateLimit`);
    `packages/ai/src/rate-limit.test.ts` (extend)
  - **Acceptance:**
    - `checkEvaluateLimit(userId)` mirrors `checkSearchLimit` shape (`{ allowed, remaining }`);
      pro tier (subscriptionStatus `active`/`past_due`) is uncapped.
    - Tests cover under-limit, at-limit (`requiresUpgrade`), and subscribed-bypass.
  - **Estimate:** 0.5 day

- [ ] T12 — Export + register the tool in the orchestrator
  - **Files:** `packages/ai/src/tools/index.ts` (export `evaluateJobTool`);
    `packages/ai/src/agents/orchestrator.ts` (register in `tools: { ... }`);
    `packages/ai/src/agents/orchestrator.test.ts` (extend)
  - **Acceptance:**
    - `evaluateJob` registered in the `streamText` `tools` object with `userId` injected
      server-side and wrapped by `checkEvaluateLimit` for non-subscribers (same shape as
      `searchJobs`); `stopWhen: stepCountIs(5)` unchanged.
    - Orchestrator test asserts the tool is registered and `userId` is never sourced from the LLM.
  - **Estimate:** 0.5 day

- [ ] T13 — Document the tool in the system prompt
  - **Files:** `packages/ai/src/prompts.ts` (`getOrchestratorPrompt`); Langfuse prompt
    `orchestrator-system`; `packages/ai/src/prompts.test.ts` (extend)
  - **Acceptance:**
    - Prompt documents `evaluateJob` (when to call it; that it can/should return
      `not_recommended` honestly; no invented CV evidence) per guardrails (#6) + Article 7.
    - `prompts.test.ts` asserts the prompt mentions `evaluateJob`.
  - **Estimate:** 0.5 day

## Phase 4 — UX surfaces (canvas + drawer + chat + sort)

- [ ] T14 — Canvas-sync case for `evaluateJob`
  - **Files:** `apps/web/hooks/use-canvas-sync.ts` (add `case "evaluateJob"` + state field);
    `apps/web/hooks/use-canvas-sync.test.ts` (new or extend, `--selectProjects web-lib`)
  - **Acceptance:**
    - `handleToolResult("evaluateJob", result)` stores the structured evaluation on canvas
      state (keyed by `jobId`) and exposes a clear/reset callback like `clearSalaryInsights`.
    - Unknown-tool default path remains intact.
    - Test asserts state updates for an `evaluateJob` result and ignores malformed input.
  - **Estimate:** 0.5 day

- [ ] T15 — Score badge + band pill on the job card
  - **Files:** `apps/web/components/canvas/job-card.tsx`; uses `@ever-hust/ui/badge`,
    `cn()` from `@ever-hust/ui/lib/utils`
  - **Acceptance:**
    - Badge colors: green ≥80 / amber 60–79 / grey <60; band pill text "Apply now" / "Worth it"
      / "For a reason" / "Skip — here's why".
    - Renders only when an evaluation exists for the job; absent evaluation = no badge (no layout
      break).
    - Clicking the badge opens the detail breakdown (T16).
  - **Estimate:** 0.5 day

- [ ] T16 — A–F breakdown in the detail drawer
  - **Files:** `apps/web/components/canvas/evaluation-card.tsx` (new, modeled on
    `salary-insights-card.tsx`); `apps/web/components/canvas/job-detail-panel.tsx`
  - **Acceptance:**
    - Renders the dimension table (key, weight, score5, rationale, source), CV-match evidence +
      gaps, comp fit, customization, optional interview plan, and the recommendation.
    - `not_recommended` is shown plainly with its reason — never hidden.
    - Uses `@ever-hust/ui/*`; matches the overlay-card pattern.
  - **Estimate:** 1 day

- [ ] T17 — Read API route for persisted evaluations
  - **Files:** `apps/web/app/api/evaluations/[jobId]/route.ts` (new);
    `apps/web/lib/api-schemas.ts` (add schema); test under `tests/` / `--selectProjects web-lib`
  - **Acceptance:**
    - `GET` uses `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, Zod-validates
      the `jobId` param, returns the persisted `evaluations` row for `(userId, jobId)` or
      `apiBadRequest()`/404 via `apps/web/lib/api-response.ts`.
    - Response carries the default private no-store cache headers.
    - Test covers auth-required, valid fetch, and not-found.
  - **Estimate:** 0.5 day

- [ ] T18 — "Best for me" sort (additive)
  - **Files:** `apps/web/components/canvas/filter-bar.tsx`;
    `apps/web/components/canvas/jobs-canvas.tsx`
  - **Acceptance:**
    - Adds a "Best for me" sort option that orders jobs by persisted evaluation `score` desc when
      evaluations exist; "Newest" remains the default and is not removed.
    - Jobs without an evaluation sort after scored jobs.
  - **Estimate:** 0.5 day

## Phase 5 — E2E + hardening + docs

- [ ] T19 — Playwright E2E: evaluate a synced job end-to-end
  - **Files:** `tests/e2e/evaluation.spec.ts` (new)
  - **Acceptance:**
    - Drives the chat to evaluate a synced job, asserts the score badge + band pill appear on the
      canvas card and the A–F breakdown opens in the drawer.
    - Asserts a `not_recommended` fixture renders its reason plainly.
    - Green under `pnpm test:e2e` (baseURL `http://localhost:8443`).
  - **Estimate:** 1 day

- [ ] T20 — Consistency snapshot tests + model pin
  - **Files:** `packages/ai/src/tools/__tests__/evaluate-job.fixtures.test.ts` (new);
    `packages/ai/src/tools/evaluate-job.ts` (pin model + temperature for the `generateObject` call)
  - **Acceptance:**
    - Deterministic core is snapshot-tested across a small fixture set of jobs (strong-fit,
      mid-fit, bad-fit) to guard scoring consistency.
    - The LLM call pins model + temperature; documented in the test.
  - **Estimate:** 0.5 day

- [ ] T21 — Docs + ROADMAP + competitor-clean check
  - **Files:** `packages/ai/src/structured/STRUCTURED_OUTPUT.md` (or `packages/ai/README`);
    `docs/specs/ROADMAP.md`
  - **Acceptance:**
    - Documents the evaluation artifact (schema v1), the weights-merge order, the determinism
      boundary, and the org override key.
    - ROADMAP marks epic 03 progress.
    - `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e` green; grep confirms **zero
      competitor references** across the diff (Article 11).
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Keep `evaluateJob` standalone-first: read already-synced `jobs` data; no live Ever Jobs call
  in the hot path; no Gauzy dependency.
- Human-in-the-loop: `evaluateJob` only advises — it never applies, sends, or submits anything.
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
