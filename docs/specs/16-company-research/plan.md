# Plan: 16 — Deep Company Research

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

Today the `companyResearch` tool (`packages/ai/src/tools/company-research.ts`) is a single-source
aggregator: it reads the `jobs` table for one company and rolls up open-position metadata
(industry, size, locations, departments, levels) from the already-synced firmographic columns
(`companyName`, `companyIndustry`, `companyNumEmployees`, `companyDescription`, …). It is registered
plainly in the orchestrator (`packages/ai/src/agents/orchestrator.ts`) and is **not** wired to the
canvas. This epic upgrades it into a **multi-axis, multi-source enricher** that returns a
structured, cached research card across ~6 axes (firmographics, funding, tech stack, reputation,
hiring trend, news), each field carrying **provenance** (which source produced it, when, with what
confidence), rendered **progressively** in the canvas.

The work is layered so each layer ships independently and the tool keeps working at every step. We
start at the **contract**: define a Zod-validated `companyResearch` artifact in the shared
structured-output module (`packages/ai/src/structured/`, the epic #5 contract) so every axis/field
is queryable and machine-checkable, mirroring how `evaluationArtifact`
(`packages/ai/src/structured/schemas/evaluation.ts`) is defined. The artifact's `summary` is the
single source of truth that the DB cache row, the tool result, and the canvas card all conform to.

Next we add the **cache**: a new `company_research` table
(`packages/db/src/schema/company-research.ts`, exported from
`packages/db/src/schema/index.ts`, applied with `pnpm db:push`) that stores one row per normalized
company name, with one jsonb column per axis, a per-field provenance map, and a `fetchedAt`
timestamp for TTL. This is **this-user-agnostic, corpus-level** company data, so per the Partition
Rule (constitution Article 6) it is acceptable to cache it Hust-side keyed by company — it is not
identity-bound. (No `userId` column.)

Then we build the **enricher core**: a small plugin interface (`CompanyResearchSource`) and a
`mergeWithProvenance` reducer in `packages/ai/src/company-research/`. Each source fills the axes it
can, independently and best-effort; the merger combines partial results, recording provenance and
resolving conflicts by confidence + recency. The **first concrete source** is the existing
jobs-table aggregator, refactored into a source plugin so behaviour is preserved (constitution
Article 9 — additive, never remove). Every field is **grounded** in a real source row — unknown
fields are emitted as `null` with no provenance, never invented (constitution Article 7).

The tool's `execute` becomes: normalize the company name → look up the cache → for any axis that is
missing or past TTL, run the registered sources (respecting per-source rate limits via
`packages/ai/src/rate-limit.ts`) → merge with provenance → upsert the cache row → return the
validated artifact. `userId` stays server-injected by the orchestrator; it is never an LLM param
(it is not needed for company-level data, but the gating tier still reads `users.subscriptionStatus`).

The **canvas** layer adds a `case "companyResearch"` to `apps/web/hooks/use-canvas-sync.ts` and a
new overlay card `apps/web/components/canvas/company-research-card.tsx`, modelled on
`salary-insights-card.tsx`. The card renders a skeleton, then fills each axis as fields arrive,
showing a provenance chip per field. A read-only API route
(`apps/web/app/api/companies/[company]/research/route.ts`) lets the card hydrate the cached card
directly (e.g. on an application-detail view) without a chat turn, with `requireSessionUser()` +
`applyRateLimit()` per the house API pattern.

The **optional Ever Jobs firmographics source** is added last as a second plugin behind the
existing `everJobsClient` (`packages/jobs-api`), gracefully degrading to jobs-table data when the
API or a firmographics field is unavailable — Ever Jobs is Hust's only hard external dependency
(constitution Article 2), and the source is best-effort. No Gauzy dependency is introduced; if any
Gauzy firmographics seam is ever added it lives behind the standard flag+adapter and is out of
scope here.

We document the upgraded tool in `packages/ai/src/prompts.ts` (and the Langfuse
`orchestrator-system` prompt) so the model knows the card now spans 6 axes with provenance and is
read-only research (no submit/apply side effects — Article 4 is trivially satisfied: this tool
never sends anything). Unit tests live alongside each module; a Playwright E2E asserts the card
renders progressively.

## 2. Phases

### Phase 1 — Structured contract + cache table

- Goal: Define the `companyResearch` artifact schema (axes + per-field provenance) in the shared
  structured-output module and stand up the `company_research` cache table.
- Deliverables:
  - `companyResearchArtifact` + `companyResearchSummarySchema` (6 axes, each field nullable with a
    `provenance` entry) in `packages/ai/src/structured/schemas/company-research.ts`, exported from
    `packages/ai/src/structured/index.ts`.
  - `company_research` Drizzle table (`packages/db/src/schema/company-research.ts`) + export in
    `packages/db/src/schema/index.ts`; schema pushed with `pnpm db:push`.
  - Unit tests for the schema (valid/invalid axis + provenance shapes) and the row types.
- Exit criteria: `pnpm test -- --selectProjects ai db` green for the new schemas; `pnpm db:push`
  applies the table; `pnpm check-types` clean.

### Phase 2 — Multi-source enricher core (plugin + merge-with-provenance)

- Goal: A plugin interface and a provenance-aware merger, with the existing jobs-table aggregator
  refactored into the first source plugin (behaviour preserved).
- Deliverables:
  - `CompanyResearchSource` interface + `mergeWithProvenance()` in
    `packages/ai/src/company-research/types.ts` and `.../merge.ts`.
  - `jobsTableSource` plugin in `packages/ai/src/company-research/sources/jobs-table.ts` (lifts the
    current jobs-table aggregation logic).
  - Cache read/write helpers (`getCachedResearch` / `upsertResearch` with TTL) in
    `packages/ai/src/company-research/cache.ts`.
  - Unit tests for merge precedence (confidence + recency), TTL expiry, and the jobs-table source.
- Exit criteria: merger and cache unit tests green; the jobs-table source reproduces the current
  tool's firmographic output for a fixture company.

### Phase 3 — Tool upgrade + registration + system prompt

- Goal: Rewire `companyResearchTool.execute` to cache-lookup → run sources → merge → upsert →
  return the validated artifact; keep it registered; document it.
- Deliverables:
  - Upgraded `packages/ai/src/tools/company-research.ts` returning a validated
    `companyResearchArtifact` (graceful per-source failure, no invented fields).
  - Confirmed registration in `packages/ai/src/agents/orchestrator.ts` `tools` object.
  - Per-source rate-limit guard in `packages/ai/src/rate-limit.ts` (e.g.
    `checkCompanyResearchSourceLimit`).
  - Updated tool docs in `packages/ai/src/prompts.ts` + a note to update the Langfuse
    `orchestrator-system` prompt.
  - Unit tests for the tool (cache hit short-circuits sources; cache miss runs + upserts; partial
    source failure still returns the axes that succeeded).
- Exit criteria: `pnpm test -- --selectProjects ai` green; `prompts.test.ts` reflects the new tool
  description.

### Phase 4 — Progressive research card UI + read-only API

- Goal: Surface the card on the canvas with progressive (skeleton → fields) rendering and per-field
  provenance; expose a read-only hydration route.
- Deliverables:
  - `apps/web/components/canvas/company-research-card.tsx` (modelled on `salary-insights-card.tsx`).
  - `case "companyResearch"` in `apps/web/hooks/use-canvas-sync.ts` (+ `companyResearch` state and
    a `clearCompanyResearch` callback) wired into `apps/web/app/(dashboard)/chat/page.tsx`.
  - `apps/web/app/api/companies/[company]/research/route.ts` (GET; `requireSessionUser()` +
    `applyRateLimit(userId, "authenticated")`; Zod param via `apps/web/lib/api-schemas.ts`; errors
    via `apps/web/lib/api-response.ts`).
  - Component unit/render test + provenance chip render test.
- Exit criteria: `pnpm test -- --selectProjects web-lib` green; card renders cached data via the
  route.

### Phase 5 — Optional Ever Jobs firmographics source + E2E

- Goal: Add the Ever Jobs firmographics plugin (best-effort, graceful fallback) and prove the
  end-to-end progressive card.
- Deliverables:
  - `everJobsSource` plugin in `packages/ai/src/company-research/sources/ever-jobs.ts` using
    `everJobsClient` (`packages/jobs-api`), degrading to jobs-table data on unavailability.
  - Unit test for the source incl. the fallback path (no API → no error, fewer axes).
  - `tests/e2e/company-research.spec.ts` asserting skeleton → progressive field fill + provenance.
- Exit criteria: full `pnpm test` + `pnpm test:e2e` green; CI green (constitution Article 10).

## 3. Packages Touched

| Package                                                                  | Change                                                                                                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai/src/structured/schemas/company-research.ts`                 | NEW — `companyResearchArtifact` + `companyResearchSummarySchema` (6 axes, per-field provenance), mirroring `schemas/evaluation.ts`; export from `structured/index.ts`.        |
| `packages/db/src/schema/company-research.ts`                             | NEW — `company_research` cache table (one jsonb per axis, provenance map, `fetchedAt` TTL); export from `packages/db/src/schema/index.ts`; apply via `pnpm db:push`.          |
| `packages/ai/src/company-research/`                                       | NEW — enricher core: `types.ts` (`CompanyResearchSource`), `merge.ts` (`mergeWithProvenance`), `cache.ts` (TTL helpers), `sources/jobs-table.ts`, `sources/ever-jobs.ts`.    |
| `packages/ai/src/tools/company-research.ts`                              | UPGRADE — execute does cache→sources→merge→upsert→validated artifact; no invented fields; graceful per-source failure.                                                        |
| `packages/ai/src/tools/index.ts`                                        | (no change) — already exports `companyResearchTool`.                                                                                                                         |
| `packages/ai/src/agents/orchestrator.ts`                                | Confirm/keep `companyResearch` registration in the `tools` object (server-injected context; no LLM `userId`).                                                                 |
| `packages/ai/src/rate-limit.ts`                                          | NEW per-source guard (e.g. `checkCompanyResearchSourceLimit`) to respect source rate limits.                                                                                 |
| `packages/ai/src/prompts.ts`                                            | Update the `companyResearch` tool description (6 axes + provenance, read-only research); note Langfuse `orchestrator-system` update.                                          |
| `apps/web/hooks/use-canvas-sync.ts`                                      | Add `case "companyResearch"`, `companyResearch` canvas state, and `clearCompanyResearch`.                                                                                    |
| `apps/web/components/canvas/company-research-card.tsx`                   | NEW — progressive overlay card (skeleton → fields) with per-field provenance chips; modelled on `salary-insights-card.tsx`.                                                  |
| `apps/web/app/(dashboard)/chat/page.tsx`                                 | Render `CompanyResearchCard` from canvas state.                                                                                                                            |
| `apps/web/app/api/companies/[company]/research/route.ts`                 | NEW — read-only GET hydration route (`requireSessionUser()` + `applyRateLimit`).                                                                                            |
| `apps/web/lib/api-schemas.ts` / `apps/web/lib/api-response.ts`          | Add Zod param schema for the route; reuse `apiBadRequest()` / `apiError()`.                                                                                                  |
| `packages/jobs-api`                                                      | (no change) — consumed read-only via `everJobsClient` for the optional firmographics source.                                                                                |
| `tests/e2e/company-research.spec.ts`                                     | NEW — Playwright spec asserting progressive render + provenance.                                                                                                            |

## 4. Dependencies

| Library                       | Version  | Rationale                                                                                                  |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `zod`                         | existing | Artifact + provenance schema validation (Article 5/8); already the repo's validation library.             |
| `drizzle-orm` / `drizzle-kit` | existing | `company_research` table + push migration; matches house DB pattern.                                       |
| `ai` (Vercel AI SDK v6)       | existing | `tool(...)` definition; already the tool framework.                                                        |
| `@ever-hust/jobs-api`         | existing | Optional Ever Jobs firmographics source (`everJobsClient`); Hust's only hard external dep (Article 2).     |
| `@ever-hust/ui`               | existing | Card/Badge primitives for the research card.                                                               |

Upstream epic dependencies assumed by this plan:

- **#5 Structured output** — REQUIRED. `defineArtifact` / `assertArtifact` and the
  `packages/ai/src/structured/` module are the shared contract the `companyResearch` artifact plugs
  into. Already present in-tree.
- **#3 Evaluation engine** — soft. The card is a useful input to fit-scoring but is not blocked by
  it; the artifact mirrors evaluation's style for consistency.
- **#6 Guardrails (grounded/no-invent helpers)** — soft. Grounding rules (Article 7) are applied
  locally (unknown ⇒ `null`, never fabricate); if/when shared guardrail helpers land, the sources
  adopt them.

No new direct dependency is added (Article 10 §5 satisfied by reuse).

## 5. Risks & Mitigations

| Risk                                                                          | Likelihood | Impact | Mitigation                                                                                                              |
| ----------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| An enrichment source rate-limits or times out, stalling the whole card        | M          | H      | Each source runs best-effort behind `checkCompanyResearchSourceLimit`; failures degrade per-axis, never fail the card. |
| A source returns unverifiable/fabricated facts (violates Article 7)           | M          | H      | Grounded-only: unknown fields ⇒ `null` with no provenance; every emitted field carries a source+confidence record.     |
| Stale cache shows outdated funding/news                                       | M          | M      | Per-axis `fetchedAt` + TTL; expired axes are re-fetched on next access; provenance shows the field's age.               |
| Ever Jobs API unavailable degrades firmographics                              | M          | M      | `everJobsSource` is best-effort with graceful fallback to `jobsTableSource`; jobs-table source always present.          |
| Schema drift between the artifact summary and the `company_research` jsonb     | L          | M      | The DB jsonb types mirror the Zod summary (same pattern as `evaluations.ts`); `assertArtifact` gates before upsert.     |
| Progressive UI flicker / partial-state jank                                   | L          | M      | Skeleton-first card; render each axis independently; reuse the `salary-insights-card.tsx` overlay pattern.             |
| Accidental competitor reference in a source name/description (Article 11)      | L          | H      | Sources named by data class (`jobs-table`, `ever-jobs`) only; grep staged diff for competitor names before each commit. |

## 6. Rollback Plan

- The feature is additive. To disable: remove `companyResearch` from the orchestrator `tools`
  object in `packages/ai/src/agents/orchestrator.ts` (or revert the tool to its pre-epic
  jobs-table-only body) — the model simply stops offering deep research.
- Remove the `case "companyResearch"` in `apps/web/hooks/use-canvas-sync.ts` and the card render in
  `chat/page.tsx` to hide the UI without touching data.
- The `company_research` table is a pure cache: dropping or truncating it loses no user data
  (it is corpus-level, re-derivable). Leaving the table in place with the tool disabled is inert.
- The optional `everJobsSource` can be unregistered from the source list independently, leaving the
  jobs-table source as the sole enricher.

## 7. Migration Plan (if applicable)

- New `company_research` table is applied with `pnpm db:push` (no destructive change to existing
  tables; no backfill required — rows populate lazily on first research request per company).
- The existing `companyResearchTool` callers are unchanged: the orchestrator already references it
  and the input schema stays backward-compatible (`companyName` + optional `jobId`); only the
  return shape becomes the richer validated artifact. The canvas previously ignored its result, so
  no existing UI breaks.
- No env-var or config migration. The optional Ever Jobs source reuses the existing
  `EVER_JOBS_API_URL` / `everJobsClient` configuration.

## 8. Open Questions for Plan

- **Axis set freeze.** Spec lists ~6 axes (firmographics, funding, tech, reputation, hiring trend,
  news). Confirm exact axis keys + which are launch-blocking vs nice-to-have for the first card.
- **TTL per axis.** Funding/news age faster than firmographics — confirm per-axis TTL values (e.g.
  firmographics 30d, news 24h) before implementing `cache.ts`.
- **Source roster beyond launch.** This plan ships two grounded sources (jobs-table + Ever Jobs).
  Confirm whether any additional grounded enrichment source is in scope now or deferred — the
  plugin interface supports adding more later without touching the tool.
- **Cache key normalization.** Confirm the company-name normalization rule (case-fold + trim;
  handling of suffixes like "Inc."/"Ltd.") for the cache key to avoid duplicate rows.
