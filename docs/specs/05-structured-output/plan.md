# Plan: 05 — Structured-Output Contract (trunk root)

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

Spec #5 is a **platform seam**, not a user-facing feature. It is the trunk root of the
Phase-1 dependency tree: the evaluation engine (#3), guardrails (#6), funnel analytics (#8)
and the learning loop (#13) all assume that every AI artifact carries a versioned,
Zod-validated **machine summary** alongside its prose. This plan delivers that shared
contract, a thin validation harness, and proves it end-to-end by adopting it in the first
concrete artifact (`evaluateJob`, coordinated with #3). It deliberately ships **no new table
of its own** — per the spec, #5 standardises the *shape* (`Artifact<TKind, TSummary>`) that
each owning epic stores in its own table's `jsonb` columns.

The contract lives in a new module `packages/ai/src/structured/`, sibling to
`packages/ai/src/tools/` and `packages/ai/src/agents/`. The core file `contract.ts` exports
the `Artifact<TKind, TSummary>` envelope (`kind`, `schemaVersion`, `summary`, optional
`prose`), a `defineArtifact(kind, version, schema)` factory that returns a typed handle with
`parse()` / `generate()` helpers, and `assertArtifact(artifact)` — the single guard called
immediately before any DB write. `assertArtifact` is environment-aware: it **throws** in
dev/test (so a malformed summary fails the build/CI), but in production it logs the violation
and returns a deterministic safe-fallback artifact so a bad summary never 500s the user over
narration they can already see in prose. This mirrors the constitution's Article 5
(structured output everywhere) and Article 7 (grounded, no-invent) postures.

Per-kind schemas live in `packages/ai/src/structured/schemas/<kind>.ts`, each whitelisting
only the fields we intend to query/aggregate (no free-form blobs that drift) and exporting a
`schemaVersion` integer. The first concrete schema, `schemas/evaluation.ts`, is lifted
verbatim from #3 §4.1 (`score`, `score5`, `band`, `jobFamily`, `archetype`, `dimensions[]`,
`blocks{A–F}`, `recommendation`) so #3 can import it rather than redefining it — #5 owns the
shape, #3 owns the table.

For LLM-produced summaries we lean on the Vercel AI SDK's `generateObject({ schema })` so the
**model retries on schema mismatch at the call boundary** — validation is not hand-rolled
parsing. A small wrapper, `generate-object.ts`, runs `generateObject` with bounded retries
and emits a Langfuse span (the package already wires Langfuse via `experimental_telemetry` in
`packages/ai/src/agents/orchestrator.ts` and prompt management in `packages/ai/src/prompts.ts`).
For deterministic, server-computed summaries we validate with `schema.parse()` directly. Both
paths converge on `assertArtifact` before persistence.

Adoption is staged so #5 can land independently while still proving itself. Phase 1 ships the
contract + harness + evaluation schema + the convention doc + a test guard, all inside
`packages/ai`. Phase 2 wires the contract into `evaluateJob` (the tool file is owned/created by
#3; #5 provides and lands the `Artifact` plumbing and the `assertArtifact`-before-write call,
and registers/documents the tool only if #3 has not already). Phase 2 also adds the canvas-sync
case so a validated evaluation artifact surfaces on the right-hand jobs canvas, and the
prompt-doc update so the orchestrator knows the tool emits structured output, not just prose.

Standalone-first is preserved: the only external runtime dependency anywhere near this seam is
the Ever Jobs API (read indirectly via the already-synced `jobs` rows), and no Gauzy coupling
is introduced — Gauzy stays optional, behind a flag + adapter, untouched by this epic.
Everything is TypeScript on Node 24 + pnpm, with Jest unit tests written alongside each source
file and a Playwright E2E that exercises the first artifact round-trip; CI must be green before
merge.

## 2. Phases

### Phase 1 — Contract, harness & convention (inside `packages/ai`, no downstream coupling)

- Goal: Ship the shared `Artifact` contract, the validation harness (`defineArtifact`,
  `assertArtifact`, the `generateObject` wrapper), the first concrete per-kind schema
  (`evaluation`), the convention doc, and a test guard — all self-contained in `packages/ai`,
  with no dependency on #3's table existing yet.
- Deliverables:
  - `packages/ai/src/structured/contract.ts` (`Artifact`, `defineArtifact`, `assertArtifact`).
  - `packages/ai/src/structured/generate-object.ts` (bounded-retry `generateObject` + Langfuse span).
  - `packages/ai/src/structured/schemas/evaluation.ts` (Zod schema + `schemaVersion = 1`).
  - `packages/ai/src/structured/index.ts` (barrel export of the public surface).
  - `packages/ai/STRUCTURED_OUTPUT.md` (the convention every future artifact tool follows).
  - Unit tests alongside each source file (valid parse, invalid reject, version switch,
    dev-throw vs prod-fallback, retry path).
- Exit criteria: `pnpm test -- --selectProjects ai` green for the new files;
  `pnpm check-types` and `pnpm lint` clean; the contract is importable from
  `@ever-hust/ai/structured` (or the package's existing export path) with no reference to any
  table; convention doc reviewed; zero competitor references.

### Phase 2 — First adoption (`evaluateJob`) + canvas + prompt + E2E

- Goal: Prove the contract end-to-end by producing, validating, and persisting an
  `Artifact<"evaluation", EvaluationSummary>` from `evaluateJob`, surfacing it on the canvas,
  documenting it in the system prompt, and covering it with an E2E test. (The `evaluate-job.ts`
  tool, the `evaluations` table, and the score-badge card are owned by #3; #5 contributes the
  `Artifact` envelope, the `generateObject`-for-LLM-dims + `schema.parse`-for-deterministic-dims
  wiring, the `assertArtifact`-before-write call, the canvas-sync case, and the prompt doc — and
  registers the tool in the orchestrator if #3 has not.)
- Deliverables:
  - `evaluateJob` builds its result via `defineArtifact("evaluation", 1, evaluationSummarySchema)`
    — `generateObject` for LLM-reasoned dimensions/blocks, `schema.parse` for deterministic dims.
  - `assertArtifact(artifact)` called immediately before the `evaluations` row write.
  - `case "evaluateJob"` added to `apps/web/hooks/use-canvas-sync.ts` `handleToolResult` switch.
  - `evaluateJob` tool registered in `packages/ai/src/agents/orchestrator.ts` (if not already by #3)
    and exported from `packages/ai/src/tools/index.ts`.
  - System-prompt note in `packages/ai/src/prompts.ts` (and the Langfuse `orchestrator-system`
    prompt) describing that `evaluateJob` emits a structured machine summary, not just prose.
  - Unit test asserting `evaluateJob` output round-trips through `assertArtifact` + persists.
  - Playwright E2E (`tests/e2e/evaluation.spec.ts`) evaluating a synced job and asserting the
    structured artifact reaches the canvas.
- Exit criteria: a version-1 `evaluation` artifact round-trips through `assertArtifact` and
  persists; deliberately invalid LLM output is retried then safely handled (prod-fallback, no
  500); `pnpm test` and `pnpm test:e2e` green; CI (lint, type-check, unit, E2E) green on
  `develop`; zero competitor references.

## 3. Packages Touched

| Package                        | Change                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `packages/ai`                  | New `src/structured/` module: `contract.ts`, `generate-object.ts`, `schemas/evaluation.ts`, `index.ts` + `*.test.ts`. Convention doc `STRUCTURED_OUTPUT.md`. Register `evaluateJob` in `src/agents/orchestrator.ts`; export from `src/tools/index.ts`; document the structured-output convention in `src/prompts.ts`. |
| `apps/web`                     | Add `case "evaluateJob"` to `hooks/use-canvas-sync.ts` `handleToolResult`. New E2E `tests/e2e/evaluation.spec.ts`. (Score-badge card under `components/canvas/` is delivered by #3.) |
| `packages/db`                  | No new table for #5. The `evaluations` table (`packages/db/src/schema/evaluations.ts` + export in `src/schema/index.ts`) is owned by #3; #5 only defines the `jsonb` shape it stores via `schemas/evaluation.ts`. `pnpm db:push` runs as part of #3, not #5. |
| `packages/jobs-api`            | (no change) — `evaluateJob` reads already-synced `jobs` rows; Ever Jobs API access is unchanged.          |
| `packages/ui`                  | (no change) — no new UI primitive; the evaluation card (#3) reuses `@ever-hust/ui/<component>`.           |
| `packages/triggers`            | (no change) — batch/background evaluation is #19; MVP adoption is on-demand.                              |

## 4. Dependencies

| Library                | Version       | Rationale                                                                                           |
| ---------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `ai` (Vercel AI SDK)   | ^6.0.86 (in repo) | Already a direct dep of `packages/ai`. Use its `generateObject({ schema })` for boundary validation + model-retry-on-mismatch — no new dep. |
| `zod`                  | ^3.24.0 (in repo) | Already a direct dep. Per-kind whitelisted schemas + `schema.parse()` for deterministic summaries — no new dep. |
| `@langfuse/client`     | (in repo, via `prompts.ts`) | Reuse existing Langfuse wiring for the structured-generation span; no new dep.            |

No new direct dependencies are introduced. Upstream epic dependency: **#3 Evaluation engine**
(owns `evaluate-job.ts`, the `evaluations` table, and the canvas card — built first or
alongside #5). #5 must land before or with #3 so #3 can import `schemas/evaluation.ts`.
Downstream consumers (#6 guardrails, #8 funnel analytics, #13 learning loop) depend on this
contract but are out of scope here.

## 5. Risks & Mitigations

| Risk                                                          | Likelihood | Impact | Mitigation                                                                                                   |
| ------------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Over-rigid schemas slow product iteration                    | M          | M      | Keep `summary` small and whitelisted; version with `schemaVersion`; readers switch on version so old rows survive a bump. |
| LLM never satisfies the schema (infinite/expensive retries)  | M          | H      | Bounded retries in `generate-object.ts`; on exhaustion, `assertArtifact` returns a deterministic safe-fallback summary in prod (logs + does not 500). |
| `assertArtifact` throwing in prod blocks a user over narration | L          | H      | Env-aware guard: throw in dev/test, log + safe-fallback in prod; unit-tested both paths.                    |
| #5 and #3 race on `evaluate-job.ts` / orchestrator registration (concurrent sessions) | M | M | Land #5's contract in Phase 1 with zero coupling; Phase-2 wiring is guarded ("register if #3 has not"); coordinate the shared `evaluate-job.ts` edit in one session/worktree. |
| `generateObject` cost/latency per artifact                   | M          | M      | Deterministic dims use `schema.parse` (no LLM); only LLM-reasoned fields go through `generateObject`; Langfuse span makes cost observable. |
| Convention not followed by future artifact tools             | M          | M      | Ship `STRUCTURED_OUTPUT.md` + a Jest guard test that flags artifact tools lacking a registered schema.       |

## 6. Rollback Plan

- Phase 1 is additive and inert until imported: the new `packages/ai/src/structured/` module
  and `STRUCTURED_OUTPUT.md` can be removed (or left unused) with no runtime effect — nothing
  else imports them until Phase 2.
- Phase 2 adoption is reversible without data loss:
  - Revert the `evaluateJob` wiring commit; the tool (owned by #3) can fall back to its prior
    behaviour. No table is created by #5, so there is nothing to drop.
  - The `case "evaluateJob"` in `apps/web/hooks/use-canvas-sync.ts` defaults to the existing
    no-op `default` branch if removed — the canvas simply ignores the tool result.
  - The system-prompt note in `packages/ai/src/prompts.ts` / Langfuse is text-only; revert it
    or relabel the Langfuse `orchestrator-system` prompt to a prior version.
- `assertArtifact`'s prod safe-fallback means even a half-rolled-back state degrades to prose
  without erroring users.

## 7. Migration Plan (if applicable)

No data migration. #5 introduces no table and changes no existing column. Existing tools that
return prose keep doing so unchanged — they *add* a `summary` only when they adopt the
contract (additive, per constitution Article 9). Stored artifacts are forward-compatible via
`schemaVersion`: when a schema changes breakingly, bump the version; readers switch on the
stored version, so historical rows (e.g. future `evaluations.dimensions` / `evaluations.blocks`)
remain readable without backfill. The `evaluations` table itself is created by #3's
`pnpm db:push`, not by this epic.

## 8. Open Questions for Plan

- Should `assertArtifact`'s prod safe-fallback persist a sentinel summary (e.g.
  `{ kind, schemaVersion, summary: <minimal> }`) or skip the write entirely? (Lean: persist a
  minimal sentinel so downstream analytics can count "degraded" artifacts.) — confirm with #8 owner.
- Where should the public export surface live — a new `@ever-hust/ai/structured` subpath export
  or re-export from the package root? Match whatever export style `packages/ai` already uses for
  `tools`/`agents`.
- Does #3 prefer to import `schemas/evaluation.ts` directly, or should #5 also publish the
  inferred `EvaluationSummary` TS type from `structured/index.ts`? (Lean: publish the type.)
- Confirm bounded-retry count for `generateObject` (default 2 re-asks before deterministic
  fallback) with the #6 guardrails owner so retry budgets are consistent across tools.
