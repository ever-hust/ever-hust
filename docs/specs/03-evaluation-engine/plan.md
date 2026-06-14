# Plan: 03 — Evaluation Engine (`evaluateJob`) — KEYSTONE

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

The Evaluation Engine adds a 15th orchestrator tool, `evaluateJob`, that turns a synced
`jobs` row plus the user's profile into a persisted, structured **fit verdict** — a 0–100
score, a 1–5 mirror, a band-driven recommendation (including an honest `not_recommended`),
and the A–F evaluation blocks. It follows the existing tool pattern exactly (see
`packages/ai/src/tools/salary-insights.ts` and `get-job-details.ts`): a `tool({ description,
inputSchema, execute })` whose `inputSchema` is a `.max()`-bounded `z.object(...)`, with
`userId` injected server-side by the orchestrator and never accepted from the LLM.

The work is sequenced around the keystone constraint: nothing in Phase 2/3 of the roadmap
can exist until per-user scores are persisted. So we build the **data spine first** (the
`evaluations` table + the taxonomy/weights config), then the **deterministic core** (the
weight-merge + the four server-computed dimensions, all unit-testable without an LLM), then
the **LLM layer** (the reasoned dimensions + A–F prose, wrapped in the structured-output
contract from epic #5), then the **surfaces** (canvas badge/pill, detail-drawer breakdown,
chat narration, "Best for me" sort), and finally **E2E + hardening**.

The engine respects the determinism boundary from spec §6: Comp, Remote, Level, and the
CV-match baseline are computed server-side from the `jobs` DTO (`salaryMin/Max`,
`salaryInterval`, `isRemote`, `jobLevel`, `skills`) and the user's `cvParsedData` /
`preferences`, then passed into the prompt as **facts the LLM must not re-derive**. Those
dimensions are marked `source: "deterministic"`; the LLM reasons North Star alignment, the
CV-evidence mapping, Growth/Reputation/Tech/Speed/Culture, and the prose blocks, marked
`source: "llm"`. This keeps cost down, makes the core testable, and matches the discipline
the existing tools already use (deterministic server work, LLM for narration).

Structured output is non-negotiable (constitution Article 5): `evaluateJob` returns the
finished evaluation **as a Zod-validated object**, not "context + instruction". We adopt the
epic #5 contract (`packages/ai/src/structured/`) — `evaluateJob` produces an
`Artifact<"evaluation", EvaluationSummary>` (schema version 1, mirroring spec §4.1) via the
SDK's `generateObject` for the LLM dimensions (model retries on schema mismatch) and
`schema.parse` for the deterministic dimensions, then persists through `assertArtifact` into
the `evaluations` row. Because #5 is a hard upstream dependency, Phase 1 includes a thin
local shim **only if** #5 has not landed yet, with a `TODO` to delete the shim once #5 is in
`develop` (additive, never a fork of the contract).

The taxonomy (job-family → archetype) is **data, not code** (spec §3.1): a seeded
`job_family_config` table of keyword packs, org-overridable via the existing
`organization_ai_configs` table. Detection runs server-side from JD keyword signals plus the
user's CV/preferences and feeds the archetype to the prompt so the same engine scores a
Staff SRE and a Field Marketing Manager correctly. Weights merge in the order
**override → user → org → default**, always validated to sum to 100; an invalid set falls
back to default rather than throwing to the user (spec §10).

Surfacing reuses the existing canvas plumbing: a `case "evaluateJob"` in
`apps/web/hooks/use-canvas-sync.ts` lands the structured result on canvas state, a score
badge + band pill render on `apps/web/components/canvas/job-card.tsx`, and the full A–F
breakdown renders in `apps/web/components/canvas/job-detail-panel.tsx` (with
`salary-insights-card.tsx` as the overlay-card template). The orchestrator narrates the
structured object in chat; the object is the source of truth.

Standalone-first holds throughout (constitution Article 2): the only external dependency is
the Ever Jobs API, already consumed via `packages/jobs-api` and synced into `jobs` — the
engine reads today's synced `jobs` data and needs no Gauzy product. Guardrails (#6) are
inherited: the engine is prompted to be willing to say `not_recommended` and to ground every
CV-match claim in real CV evidence (no invention, per Article 7); cost is controlled by the
deterministic pre-fill, opt-in Block F (`includeInterviewPlan`), and the existing
tier-cap/rate-limit plumbing in `packages/ai/src/rate-limit.ts`.

Testing follows Article 10: Jest unit tests are written **alongside** each task (scoring
math, weight merge/validation, taxonomy detection, the four deterministic dimensions — all
without the LLM), and a Playwright E2E spec evaluates a synced job end-to-end and asserts the
badge + drawer. CI (lint, type-check, unit, E2E) must be green before merge; work lands on
`develop`.

## 2. Phases

### Phase 1 — Data spine (table + taxonomy/weights config)

- Goal: Persist a per-(user, job) evaluation and make the taxonomy + weights data-driven and
  overridable, so downstream epics (#8 funnel analytics, #2 pipeline) have a queryable record.
- Deliverables:
  - New Drizzle table `evaluations` in `packages/db/src/schema/evaluations.ts`, exported from
    `packages/db/src/schema/index.ts`, applied with `pnpm db:push`.
  - New Drizzle table `job_family_config` in
    `packages/db/src/schema/job-family-config.ts` (seeded keyword packs), exported from the
    schema index; org override read from `organizationAiConfigs` via a new JSON key
    (`evaluationConfig`) — additive, no column removal.
  - `users.preferences.evaluationWeights` (new JSON key, read-only on the existing `users`
    table — no schema change to `users`).
  - A taxonomy seed in `packages/db/src/seed/` (or `db:seed`) covering the spec §3.1 families.
- Exit criteria: `pnpm db:push` applies cleanly; `evaluations` enforces unique `(userId, jobId)`
  and indexes `(userId, band)` + `(userId, score)`; the seed populates `job_family_config`;
  schema unit tests for column shapes/enums pass under `--selectProjects db`.

### Phase 2 — Deterministic scoring core (no LLM)

- Goal: Compute the parts of the verdict Hust can compute itself, fully unit-tested without
  any model call.
- Deliverables:
  - `packages/ai/src/evaluation/weights.ts` — default 10-dimension matrix + `mergeWeights`
    (override → user → org → default), validated to sum to 100 with default fallback.
  - `packages/ai/src/evaluation/taxonomy.ts` — `detectJobFamily(jobText, cv, prefs, packs)`
    returning `{ jobFamily, archetype }` from keyword signals.
  - `packages/ai/src/evaluation/deterministic.ts` — `computeDeterministicDimensions(job, user)`
    for Comp (annualized salary vs target, reusing `salary-helpers.ts`), Remote, Level, and
    the CV-match baseline (skills overlap from `cvParsedData`), each yielding `score5` +
    `rationale` + `source: "deterministic"`.
  - `packages/ai/src/evaluation/score.ts` — `computeScore(dimensions, weights)` → `{ score,
    score5, band }` using the spec §3.3 band cutoffs.
- Exit criteria: unit tests cover weight merge/validation (incl. invalid → default fallback),
  taxonomy detection across families, each deterministic dimension, the weighted-score math,
  and band boundaries (4.5 / 4.0 / 3.5); all green under `--selectProjects ai` with no network.

### Phase 3 — LLM layer + structured output + tool

- Goal: Produce the reasoned dimensions and A–F blocks, wrap them in the #5 contract, persist,
  and register the tool.
- Deliverables:
  - `packages/ai/src/structured/schemas/evaluation.ts` — the `EvaluationSummary` Zod schema
    (schema version 1, mirroring spec §4.1), if not already provided by #5.
  - `packages/ai/src/tools/evaluate-job.ts` — the `evaluateJob` tool: reads `jobs` +
    `cvParsedData` + `preferences`, runs deterministic core, calls `generateObject` for the
    LLM dimensions/blocks (deterministic dims passed as fixed facts), assembles the
    `Artifact<"evaluation", …>`, validates via `assertArtifact`, upserts the `evaluations` row.
  - Export from `packages/ai/src/tools/index.ts`; register in
    `packages/ai/src/agents/orchestrator.ts` `tools: { ... }` with `userId` injection and a
    subscription/tier cap on evaluations/day.
  - Document the tool in `packages/ai/src/prompts.ts` (`getOrchestratorPrompt`) and the
    Langfuse `orchestrator-system` prompt.
- Exit criteria: `evaluateJob({ jobId })` returns a validated `evaluationResult` and upserts an
  `evaluations` row; a deliberately bad-fit fixture returns `band: not_recommended` with a
  concrete reason; invalid LLM output is retried then safely handled; unit tests green.

### Phase 4 — UX surfaces (canvas badge + drawer + chat + sort)

- Goal: Make the verdict visible where the user already works.
- Deliverables:
  - `case "evaluateJob"` in `apps/web/hooks/use-canvas-sync.ts` storing the structured result.
  - Score badge (green ≥80 / amber 60–79 / grey <60) + band pill on
    `apps/web/components/canvas/job-card.tsx`.
  - Full A–F breakdown in `apps/web/components/canvas/job-detail-panel.tsx` (dimension table,
    CV-evidence, comp fit, gaps, honest recommendation), reusing the
    `salary-insights-card.tsx` overlay pattern and `@ever-hust/ui/*`.
  - "Best for me" sort option in the canvas/filter bar once evaluations exist (additive — does
    not replace "newest").
  - A read API route `apps/web/app/api/evaluations/[jobId]/route.ts` (`requireSessionUser`,
    `applyRateLimit`, Zod) so the drawer can load a persisted evaluation.
- Exit criteria: badge + pill render on the canvas card; the breakdown renders in the drawer;
  `not_recommended` is shown plainly, never hidden; chat can call `evaluateJob` from natural
  language and narrate the result.

### Phase 5 — E2E + hardening + docs

- Goal: Prove the whole flow in CI and capture the cost/consistency guardrails.
- Deliverables:
  - Playwright spec `tests/e2e/evaluation.spec.ts` — evaluate a synced job end-to-end, assert
    badge + drawer.
  - Snapshot/fixture tests on a small set of fixture jobs to guard scoring consistency.
  - README/`STRUCTURED_OUTPUT.md` note documenting the evaluation artifact, weights config, and
    the determinism boundary.
  - ROADMAP progress update in `docs/specs/ROADMAP.md`.
- Exit criteria: unit + E2E green in CI; pinned model + temperature for the LLM call; zero
  competitor references verified.

## 3. Packages Touched

| Package                                                      | Change                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/evaluations.ts`                     | NEW table `evaluations` (per user × job); export from `packages/db/src/schema/index.ts`; `pnpm db:push`                                       |
| `packages/db/src/schema/job-family-config.ts`               | NEW table `job_family_config` (taxonomy packs); export from `packages/db/src/schema/index.ts`                                                 |
| `packages/db/src/schema/org-ai-config.ts`                   | ADD optional `evaluationConfig` JSON key (org weight/taxonomy override) — additive, no removal                                                |
| `packages/db/src/seed/` (`db:seed`)                         | NEW taxonomy seed for `job_family_config` (spec §3.1 families)                                                                                |
| `packages/ai/src/evaluation/weights.ts`                     | NEW default matrix + `mergeWeights` (override → user → org → default, sum-100 validation, default fallback)                                   |
| `packages/ai/src/evaluation/taxonomy.ts`                    | NEW `detectJobFamily` (keyword-signal detection)                                                                                             |
| `packages/ai/src/evaluation/deterministic.ts`               | NEW Comp/Remote/Level/CV-baseline dimensions; reuses `packages/ai/src/tools/salary-helpers.ts`                                               |
| `packages/ai/src/evaluation/score.ts`                       | NEW weighted-score + 1–5 mirror + band assignment                                                                                            |
| `packages/ai/src/structured/schemas/evaluation.ts`          | `EvaluationSummary` Zod schema (v1) — owned by #5; created here if #5 not yet landed                                                          |
| `packages/ai/src/tools/evaluate-job.ts`                     | NEW `evaluateJob` tool (deterministic core + `generateObject` + `assertArtifact` + upsert)                                                    |
| `packages/ai/src/tools/index.ts`                            | EXPORT `evaluateJobTool`                                                                                                                      |
| `packages/ai/src/agents/orchestrator.ts`                    | REGISTER `evaluateJob` in `tools: { ... }`; inject `userId`; add per-tier evaluations/day cap                                                 |
| `packages/ai/src/prompts.ts`                                | DOCUMENT `evaluateJob` in `getOrchestratorPrompt` (+ Langfuse `orchestrator-system`)                                                          |
| `packages/ai/src/rate-limit.ts`                             | ADD `checkEvaluateLimit(userId)` (free-tier cap), consistent with `checkSearchLimit`                                                          |
| `apps/web/hooks/use-canvas-sync.ts`                         | ADD `case "evaluateJob"` to `handleToolResult` + canvas state field                                                                          |
| `apps/web/components/canvas/job-card.tsx`                   | ADD score badge + band pill                                                                                                                  |
| `apps/web/components/canvas/job-detail-panel.tsx`           | ADD full A–F breakdown view                                                                                                                  |
| `apps/web/components/canvas/evaluation-card.tsx`            | NEW overlay card for the breakdown (modeled on `salary-insights-card.tsx`)                                                                    |
| `apps/web/components/canvas/filter-bar.tsx`                 | ADD "Best for me" sort option (additive)                                                                                                     |
| `apps/web/app/api/evaluations/[jobId]/route.ts`            | NEW read route (`requireSessionUser`, `applyRateLimit`, Zod from `apps/web/lib/api-schemas.ts`)                                              |
| `apps/web/lib/api-schemas.ts`                               | ADD evaluation read/query schema                                                                                                             |
| `packages/jobs-api`                                        | (no change) — engine reads already-synced `jobs`; Ever Jobs salary/firmographics consumed as-is                                              |
| `tests/e2e/evaluation.spec.ts`                              | NEW Playwright E2E (evaluate → badge + drawer)                                                                                               |

## 4. Dependencies

| Library                  | Version | Rationale                                                                                                  |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------- |
| `ai` (Vercel AI SDK)     | v6 (in repo) | `generateObject({ schema })` gives schema-validated LLM output with model retry — no new dep              |
| `zod`                    | in repo | Tool input + machine-summary validation (Article 5/8) — no new dep                                          |
| `drizzle-orm`            | in repo | `evaluations` + `job_family_config` tables, upsert (`onConflictDoUpdate`) on unique `(userId, jobId)`       |
| `@ever-hust/db`          | workspace | `db` lazy singleton + `escapeIlike` for taxonomy keyword matching                                          |
| `@ever-hust/ui`          | workspace | badge / pill / dialog / card for the canvas surfaces                                                        |

No new third-party direct dependencies are introduced (Article 10.5).

## 5. Risks & Mitigations

| Risk                                                                   | Likelihood | Impact | Mitigation                                                                                                        |
| ---------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| #5 structured-output contract not yet in `develop` when #3 starts      | M          | H      | Build a thin local `Artifact`/`assertArtifact` shim in Phase 3 with a `TODO`; switch imports to #5 once it lands |
| LLM cost / latency per evaluation                                      | M          | H      | Deterministic pre-fill of 4 dims; opt-in Block F (`includeInterviewPlan`); tier caps via `rate-limit.ts`        |
| Rubric over-fits one job family                                        | M          | M      | Taxonomy is data (`job_family_config`) + org-overridable via `organizationAiConfigs.evaluationConfig`            |
| Score gaming / run-to-run inconsistency                                | M          | M      | Pin model + temperature; validate structured output; snapshot tests on fixture jobs                              |
| Spec input `jobId: uuid` vs real integer `jobs.id`                     | H          | M      | Use integer `jobId` (matches `get-job-details`/`favorite-job`); recorded as Open Question for spec amendment      |
| Invalid weight set throws to the user                                  | L          | M      | `mergeWeights` validates sum-100 and falls back to default; never throws to the user (spec §10)                  |
| Thin/empty `jobs` salary or `cvParsedData`                             | M          | M      | Deterministic dims return `budgetFit: "unknown"` / mark gaps; never invent (Article 7)                           |
| Ever Jobs API / sync coverage gaps                                     | L          | M      | Engine runs on today's synced `jobs`; no live Ever Jobs call in the hot path (standalone-first)                  |

## 6. Rollback Plan

- The feature is additive and gated. To disable: remove the `evaluateJob` registration from
  `packages/ai/src/agents/orchestrator.ts` `tools: { ... }` (and its export from
  `packages/ai/src/tools/index.ts`); the canvas `case "evaluateJob"` becomes inert (falls
  through to the existing `default` no-op).
- Hide the surfaces by short-circuiting the badge/pill render in `job-card.tsx` and the
  drawer block in `job-detail-panel.tsx` behind a feature check; no UI breaks because the
  evaluation fields are optional on canvas state.
- The `evaluations` and `job_family_config` tables are **new and additive** — no existing
  table is altered destructively, so reverting code leaves stored rows intact (no data loss).
  Drop the tables only on an explicit decision; reads simply stop.
- The `organizationAiConfigs.evaluationConfig` key is optional/nullable — leaving it unread is
  a no-op.

## 7. Migration Plan

- No data migration is required: `evaluations` starts empty and fills on demand as users
  evaluate jobs. There is no backfill in MVP (batch/background evaluation is #19).
- `pnpm db:push` applies the two new tables (push-based, per `drizzle.config.ts`).
- `pnpm db:seed` populates `job_family_config` with the spec §3.1 keyword packs; orgs may
  later override via `organizationAiConfigs.evaluationConfig` without a deploy.
- Existing consumers are unaffected: `users`, `jobs`, `userJobs`, `applications` are read as-is;
  weights live under the new `users.preferences.evaluationWeights` key (absent = default matrix).

## 8. Open Questions for Plan

1. **`jobId` type.** Spec §4 declares `jobId: z.string().uuid()`, but the real `jobs.id` is an
   `integer` (`packages/db/src/schema/jobs.ts`). Plan assumes integer `jobId` to match
   `get-job-details`/`favorite-job`/`evaluations.jobId` FK. Confirm and amend spec §4/§4.1.
2. **Taxonomy storage.** Spec §5 offers "`job_family_config` table **or** seed-in-code + org
   override". Plan picks the table (queryable + org-overridable without deploy). Confirm.
3. **Org override surface.** New `evaluationConfig` JSON key on `organizationAiConfigs` vs a new
   column — plan uses a JSON key (additive, matches the table's `apiKeys`/`enabledTools` style).
4. **Free-tier cap value.** Spec §4 says "capped evaluations/day"; the exact free-tier number
   needs a product decision (mirror the 5 searches/day shape in `rate-limit.ts`).
5. **Re-evaluation history.** MVP upserts latest-wins (spec §4). Confirm history is deferred
   (would need a non-unique table or a separate `evaluation_history` — out of MVP scope).
6. **Block G (legitimacy).** Rendered only if the Ever Jobs legitimacy signal (#7) is present;
   confirm the read path/field name on the `jobs` row that #7 will populate.
