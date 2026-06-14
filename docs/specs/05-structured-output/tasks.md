# Tasks: 05 — Structured-Output Contract (trunk root)

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Contract, harness & convention (inside `packages/ai`)

- [ ] T01 — Define the `Artifact` envelope + `defineArtifact` factory
  - **Files:** `packages/ai/src/structured/contract.ts`, `packages/ai/src/structured/contract.test.ts`
  - **Acceptance:**
    - Exports `type Artifact<TKind extends string, TSummary> = { kind: TKind; schemaVersion: number; summary: TSummary; prose?: string }`.
    - Exports `defineArtifact(kind, version, schema)` returning `{ kind, version, schema, parse(input): Artifact<...>, generate(...) }`; `parse` runs `schema.parse` on the summary and wraps it in the envelope.
    - `summary` is whitelisted — only fields declared by the per-kind Zod schema survive; unknown keys are stripped (`.strict()` or equivalent).
    - Unit tests: a valid summary parses into a correct envelope; an unknown/extra field is rejected or stripped; `schemaVersion` is carried through; type inference of `TSummary` matches the schema (compile-time `expectTypeOf`-style assertion or a typed fixture).
  - **Estimate:** 1 day

- [ ] T02 — Implement `assertArtifact` with env-aware throw-vs-fallback
  - **Files:** `packages/ai/src/structured/contract.ts` (extend), `packages/ai/src/structured/contract.test.ts` (extend)
  - **Acceptance:**
    - Exports `assertArtifact(artifact)` — re-validates the envelope's `summary` against its kind's schema right before any DB write.
    - In dev/test (`NODE_ENV !== "production"`) an invalid summary **throws**; in production it logs (`console.error`) and returns a deterministic safe-fallback artifact (never throws to the user).
    - Unit tests cover: valid artifact passes through unchanged; invalid artifact throws in test env; invalid artifact returns the safe-fallback (and logs) when `NODE_ENV` is forced to `"production"`.
  - **Estimate:** 0.5 day

- [ ] T03 — `generateObject` wrapper with bounded retry + Langfuse span
  - **Files:** `packages/ai/src/structured/generate-object.ts`, `packages/ai/src/structured/generate-object.test.ts`
  - **Acceptance:**
    - Wraps the Vercel AI SDK `generateObject({ model, schema, prompt/messages })` (dep `ai@^6` already in `packages/ai/package.json`).
    - Retries on schema-mismatch up to a bounded count (default 2 re-asks); on exhaustion surfaces a typed failure the caller maps to a deterministic fallback (consumed by `assertArtifact`).
    - Emits an `experimental_telemetry` span (same Langfuse wiring style as `packages/ai/src/agents/orchestrator.ts`) tagged with the artifact `kind` + `schemaVersion`.
    - Unit tests (model + Langfuse mocked): success on first try returns the parsed object; one mismatch then success returns the object; exhausted retries returns the typed failure. No live network.
  - **Estimate:** 1 day

- [ ] T04 — First concrete per-kind schema: `evaluation` (schemaVersion 1)
  - **Files:** `packages/ai/src/structured/schemas/evaluation.ts`, `packages/ai/src/structured/schemas/evaluation.test.ts`
  - **Acceptance:**
    - Exports `evaluationSummarySchema` (Zod) matching spec #3 §4.1: `jobId`, `score` (0–100), `score5` (1–5), `band` enum (`apply_now`|`worth_it`|`specific_reason`|`not_recommended`), `jobFamily`, `archetype`, `dimensions[]` (`key`, `weight`, `score5`, `rationale`, `source` enum `deterministic`|`llm`), `blocks{roleSummary, cvMatch{evidence[],gaps[]}, levelStrategy, compDemand{summary,budgetFit enum}, customization, interviewPlan?[]}`, `recommendation`.
    - Exports `EVALUATION_SCHEMA_VERSION = 1` and the inferred `EvaluationSummary` type.
    - Whitelisted (`.strict()`); no free-form blob fields.
    - Unit tests: a full valid evaluation parses; missing required field rejects; out-of-range `score`/`score5` rejects; invalid `band` rejects; optional `interviewPlan` absent is valid.
  - **Estimate:** 1 day

- [ ] T05 — Public export surface (`structured/index.ts`)
  - **Files:** `packages/ai/src/structured/index.ts`, `packages/ai/src/index.ts` (re-export if the package uses a root barrel)
  - **Acceptance:**
    - Barrel re-exports `Artifact`, `defineArtifact`, `assertArtifact`, the `generateObject` wrapper, `evaluationSummarySchema`, `EVALUATION_SCHEMA_VERSION`, and `EvaluationSummary`.
    - Export path matches the package's existing convention (mirrors how `tools`/`agents` are surfaced); importable from the package without reaching into `src/structured/*` file paths.
    - `pnpm check-types` clean; a smoke test imports each symbol from the public path.
  - **Estimate:** 0.5 day

- [ ] T06 — Convention doc: `STRUCTURED_OUTPUT.md`
  - **Files:** `packages/ai/STRUCTURED_OUTPUT.md`
  - **Acceptance:**
    - Documents the `Artifact<TKind, TSummary>` envelope, the `defineArtifact` / `assertArtifact` / `generateObject`-wrapper usage, the "new artifact tools emit a machine summary, not just prose" rule, the whitelist + `schemaVersion` discipline, and where each kind's schema lives (`src/structured/schemas/<kind>.ts`).
    - References constitution Article 5 (structured output) and Article 7 (grounded, no-invent).
    - Lives under the package (not the repo root) per the no-stray-root-docs rule; contains zero competitor references.
  - **Estimate:** 0.5 day

- [ ] T07 — Test guard: artifact tools must register a schema
  - **Files:** `packages/ai/src/structured/guard.test.ts`
  - **Acceptance:**
    - A Jest test that enumerates artifact-producing tools (those importing `defineArtifact`) and asserts each references a kind that has a registered schema under `src/structured/schemas/`.
    - Fails loudly with an actionable message when a new artifact tool is added without a schema.
    - Runs under `pnpm test -- --selectProjects ai`; green for the current set.
  - **Estimate:** 0.5 day

## Phase 2 — First adoption (`evaluateJob`) + canvas + prompt + E2E

- [ ] T08 — Wire `evaluateJob` to emit `Artifact<"evaluation", EvaluationSummary>`
  - **Files:** `packages/ai/src/tools/evaluate-job.ts` (owned by #3; #5 adds the `Artifact` plumbing), `packages/ai/src/tools/__tests__/evaluate-job.test.ts`
  - **Acceptance:**
    - The tool builds its result via `defineArtifact("evaluation", EVALUATION_SCHEMA_VERSION, evaluationSummarySchema)`: deterministic dimensions (Comp/Remote/Level/CV-baseline) validated via `schema.parse`; LLM-reasoned dims/blocks produced via the `generate-object.ts` wrapper.
    - `userId` stays server-injected (never an LLM param), consistent with `packages/ai/src/agents/orchestrator.ts`.
    - Unit test (LLM + DB mocked): a fixture (user profile + synced `jobs` row) yields a valid `Artifact<"evaluation">`; a deliberately bad-fit fixture yields `band: "not_recommended"` with a concrete reason.
  - **Estimate:** 1 day

- [ ] T09 — Persist with `assertArtifact` immediately before the `evaluations` write
  - **Files:** `packages/ai/src/tools/evaluate-job.ts` (extend), `packages/ai/src/tools/__tests__/evaluate-job.test.ts` (extend)
  - **Acceptance:**
    - `assertArtifact(artifact)` is the last step before persisting to the `evaluations` row (table owned/created by #3 via `pnpm db:push`; #5 writes through `db` from `@ever-hust/db`).
    - The persisted `dimensions` / `blocks` `jsonb` match the validated summary shape.
    - Unit test: a valid artifact persists (DB mocked, assert payload shape); a forced-invalid artifact in prod-mode logs + writes the safe-fallback rather than throwing.
  - **Estimate:** 0.5 day

- [ ] T10 — Register `evaluateJob` in the orchestrator + tools barrel (if not already by #3)
  - **Files:** `packages/ai/src/agents/orchestrator.ts`, `packages/ai/src/tools/index.ts`, `packages/ai/src/agents/orchestrator.test.ts`
  - **Acceptance:**
    - `export { evaluateJobTool } from "./evaluate-job"` added to `tools/index.ts` (if absent).
    - `evaluateJob` added to the `tools: { ... }` object in `createOrchestratorStream` with `userId` injected server-side (same wrapper pattern as `favoriteJob`/`interviewPrep`); still bounded by `stopWhen: stepCountIs(5)`.
    - Guarded against a duplicate registration if #3 already added it (coordinate in one session/worktree).
    - `orchestrator.test.ts` asserts `evaluateJob` is present in the registered tool set.
  - **Estimate:** 0.5 day

- [ ] T11 — Canvas-sync case for the evaluation artifact
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`, `apps/web/hooks/use-canvas-sync.test.ts` (or `tests` under `web-lib` project)
  - **Acceptance:**
    - Adds `case "evaluateJob"` to `handleToolResult`, reading the validated `summary` (score, band, dimensions, blocks) and updating canvas state so the score/band surfaces on the right-hand canvas (consumed by #3's score-badge card).
    - Falls through gracefully (existing `default` branch) for malformed/absent summaries — never crashes the canvas.
    - Unit test: dispatching an `evaluateJob` result updates the expected canvas state; an empty/error result is ignored.
  - **Estimate:** 0.5 day

- [ ] T12 — System-prompt update: document structured output for `evaluateJob`
  - **Files:** `packages/ai/src/prompts.ts`, `packages/ai/src/prompts.test.ts`
  - **Acceptance:**
    - The `DEFAULT_ORCHESTRATOR_PROMPT` lists `evaluateJob` and states it emits a structured machine summary (score, band, A–F blocks) alongside narration — the orchestrator narrates the structured result, does not re-format it.
    - A note flags that the same content must be mirrored into the Langfuse `orchestrator-system` prompt (label `production`).
    - `prompts.test.ts` asserts the default prompt mentions `evaluateJob` and the structured-output convention.
  - **Estimate:** 0.5 day

- [ ] T13 — E2E: evaluation artifact round-trips to the canvas
  - **Files:** `tests/e2e/evaluation.spec.ts`
  - **Acceptance:**
    - Playwright test (baseURL `http://localhost:8443`) drives the chat to evaluate a synced job and asserts the structured result (score badge / band) renders on the jobs canvas.
    - Asserts an honest `not_recommended` verdict renders plainly when the fixture job is a bad fit (no hidden negative).
    - Runs under `pnpm test:e2e`; green in CI.
  - **Estimate:** 1 day

- [ ] T14 — Full-suite verification + competitor-clean check
  - **Files:** (verification only — `packages/ai/**`, `apps/web/hooks/use-canvas-sync.ts`, `tests/e2e/evaluation.spec.ts`)
  - **Acceptance:**
    - `pnpm test -- --selectProjects ai`, `pnpm test` (web-lib + ai), `pnpm test:e2e`, `pnpm lint`, `pnpm check-types` all green.
    - `rg` over the staged change returns **zero** competitor references (constitution Article 11); only Ever brands (Ever Jobs, Ever Gauzy, Hust, Ever Co.) appear.
    - CI (lint, type-check, unit, E2E) green on `develop` before opening the PR to `main`.
    - `docs/specs/ROADMAP.md` progress updated for epic 05.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- `packages/db` gets **no new table** in this epic — the `evaluations` table and `pnpm db:push`
  are owned by #3. #5 only defines the `jsonb` shape (`schemas/evaluation.ts`) that #3 stores.
- #5 must land before or alongside #3 so #3 can import `evaluationSummarySchema`.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
