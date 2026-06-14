# Tasks: 16 — Deep Company Research

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Structured contract + cache table

- [ ] T01 — Define the `companyResearch` artifact + summary schema (6 axes, per-field provenance)
  - **Files:** `packages/ai/src/structured/schemas/company-research.ts` (NEW),
    `packages/ai/src/structured/index.ts` (add exports)
  - **Acceptance:**
    - `companyResearchSummarySchema` defines 6 axes (firmographics, funding, tech, reputation,
      hiringTrend, news); every field is nullable and pairs with a `provenance` record
      (`{ source: string; fetchedAt: string; confidence: number (0–1) }` or `null` when unknown).
    - All string/array fields carry `.max()` bounds (Article 8 §3); `companyName` `.max(200)`.
    - `companyResearchArtifact = defineArtifact("company_research", 1, companyResearchSummarySchema)`,
      exported from `structured/index.ts`, following the `evaluationArtifact` pattern.
    - Inferred `CompanyResearchSummary` type exported.
  - **Estimate:** 1 day

- [ ] T02 — Unit-test the artifact schema (valid/invalid axis + provenance shapes)
  - **Files:** `packages/ai/src/structured/schemas/company-research.test.ts` (NEW)
  - **Acceptance:**
    - Valid full-card object parses; an unknown field is rejected (strict); a field with a value but
      no provenance is rejected; confidence outside 0–1 is rejected.
    - `companyResearchArtifact.build(summary, prose)` returns `{ kind, schemaVersion: 1, summary }`.
    - `pnpm test -- --selectProjects ai` green for this file.
  - **Estimate:** 0.5 day

- [ ] T03 — Add the `company_research` cache table + export
  - **Files:** `packages/db/src/schema/company-research.ts` (NEW),
    `packages/db/src/schema/index.ts` (add export)
  - **Acceptance:**
    - `pgTable("company_research", …)` with `id integer().primaryKey().generatedAlwaysAsIdentity()`,
      `companyKey text().notNull().unique()` (normalized name), one `jsonb` column per axis
      `$type<…>().default(null)`, a `provenance jsonb` map, `fetchedAt timestamp` per-axis or a
      table-level `timestamp("created_at").notNull().defaultNow()` + `updatedAt`.
    - `index("company_research_company_key_idx").on(table.companyKey)`.
    - jsonb axis types mirror `CompanyResearchSummary` (DX-only types, like `evaluations.ts`).
    - No `userId` column (corpus-level cache — Partition Rule, Article 6).
    - Exported from `packages/db/src/schema/index.ts`.
  - **Estimate:** 0.5 day

- [ ] T04 — Push the schema + smoke-test the table
  - **Files:** `packages/db/drizzle.config.ts` (no change — verify schema glob),
    `packages/db/src/schema/company-research.test.ts` (NEW — type/shape test)
  - **Acceptance:**
    - `pnpm db:push` applies `company_research` with no errors and no destructive diff to existing
      tables.
    - Row-type test asserts the table's inferred insert/select types compile.
    - `pnpm check-types` clean.
  - **Estimate:** 0.5 day

## Phase 2 — Multi-source enricher core (plugin + merge-with-provenance)

- [ ] T05 — Define the `CompanyResearchSource` plugin interface
  - **Files:** `packages/ai/src/company-research/types.ts` (NEW)
  - **Acceptance:**
    - `CompanyResearchSource` exposes `name: string` and
      `fetch(input): Promise<Partial<CompanyResearchSummary>>` returning only the axes it can fill,
      best-effort (never throws — returns `{}` on failure).
    - Types import the summary type from `@ever-hust/ai` structured module (no DB import — avoid the
      circular dep noted in `evaluations.ts`).
  - **Estimate:** 0.5 day

- [ ] T06 — Implement `mergeWithProvenance` + unit tests
  - **Files:** `packages/ai/src/company-research/merge.ts` (NEW),
    `packages/ai/src/company-research/merge.test.ts` (NEW)
  - **Acceptance:**
    - Merges N partial source results into one `CompanyResearchSummary`; per field, picks the
      highest-confidence then most-recent value and records its provenance.
    - Unknown fields remain `null` with `null` provenance (no invention — Article 7).
    - Tests cover: conflict resolution by confidence, tie-break by recency, all-empty input ⇒ all
      `null`, single-source passthrough.
  - **Estimate:** 1 day

- [ ] T07 — Implement the cache read/write helpers with TTL + tests
  - **Files:** `packages/ai/src/company-research/cache.ts` (NEW),
    `packages/ai/src/company-research/cache.test.ts` (NEW)
  - **Acceptance:**
    - `getCachedResearch(companyKey)` returns the row's fresh axes and the set of stale/missing axes
      (per-axis TTL from constants); `upsertResearch(companyKey, summary)` writes via
      `db` (`@ever-hust/db`) and bumps `updatedAt`.
    - Company-name normalization helper (`normalizeCompanyKey`) case-folds + trims; tested.
    - Tests (mocked `db`) cover: fresh hit, expired axis flagged stale, miss returns all axes stale.
  - **Estimate:** 1 day

- [ ] T08 — Refactor the jobs-table aggregator into the first source plugin + tests
  - **Files:** `packages/ai/src/company-research/sources/jobs-table.ts` (NEW),
    `packages/ai/src/company-research/sources/jobs-table.test.ts` (NEW)
  - **Acceptance:**
    - `jobsTableSource` lifts the existing logic from `tools/company-research.ts` (ilike on
      `jobs.companyName`, roll up industry/size/description/locations/departments/levels via
      `escapeIlike`) and maps it onto the firmographics + hiringTrend axes with `source:"jobs-table"`
      provenance.
    - Behaviour preserved: for a fixture company it reproduces today's firmographic output
      (Article 9 — additive, no regression).
    - Returns `{}` (not a throw) when no matching jobs exist.
  - **Estimate:** 1 day

## Phase 3 — Tool upgrade + registration + system prompt

- [ ] T09 — Upgrade `companyResearchTool.execute` to cache→sources→merge→upsert→artifact
  - **Files:** `packages/ai/src/tools/company-research.ts` (UPGRADE)
  - **Acceptance:**
    - `execute({ companyName, jobId })` normalizes the key (resolving `companyName` from `jobs` when
      `jobId` is given, as today), reads the cache, runs registered sources only for stale/missing
      axes, merges with provenance, upserts, and returns
      `companyResearchArtifact.build(summary, prose)` validated via `assertArtifact`.
    - `inputSchema` unchanged (`companyName` `.max(200)`, optional `jobId`); `userId` NOT an LLM
      param.
    - On total failure returns `{ error, companyName }` (existing graceful shape); partial source
      failure still returns the axes that succeeded.
  - **Estimate:** 1 day

- [ ] T10 — Add the per-source rate-limit guard + tests
  - **Files:** `packages/ai/src/rate-limit.ts` (add `checkCompanyResearchSourceLimit`),
    `packages/ai/src/rate-limit.test.ts` (extend)
  - **Acceptance:**
    - A per-source limiter caps source calls (mirrors `checkSearchLimit`/`checkRateLimit` style);
      sources past the limit are skipped, not errored.
    - Test asserts the limiter blocks after the cap and that a blocked source yields `{}` (card
      still returns cached/other-source axes).
  - **Estimate:** 0.5 day

- [ ] T11 — Confirm orchestrator registration of the upgraded tool
  - **Files:** `packages/ai/src/agents/orchestrator.ts` (verify/adjust the `tools` object)
  - **Acceptance:**
    - `companyResearch` remains in the `streamText` `tools` object; if any server context is now
      needed it is injected server-side (never an LLM param), matching the `getUserProfile` pattern.
    - `stopWhen: stepCountIs(5)` unchanged; `orchestrator.test.ts` still green.
  - **Estimate:** 0.5 day

- [ ] T12 — Update the system prompt (local + Langfuse) to document the 6-axis card
  - **Files:** `packages/ai/src/prompts.ts` (update the `companyResearch` description),
    `packages/ai/src/prompts.test.ts` (extend)
  - **Acceptance:**
    - The `companyResearch` bullet in `DEFAULT_ORCHESTRATOR_PROMPT` describes the 6 axes +
      per-field provenance and states it is read-only research (no submit/apply — Article 4).
    - A `## Company Research` usage section explains progressive presentation and the "unknown ⇒ say
      so, never invent" rule (Article 7).
    - `prompts.test.ts` asserts the new description text; a code comment notes the Langfuse
      `orchestrator-system` prompt must be updated in parallel.
  - **Estimate:** 0.5 day

- [ ] T13 — Unit-test the upgraded tool end-to-end (cache hit / miss / partial failure)
  - **Files:** `packages/ai/src/tools/company-research.test.ts` (NEW)
  - **Acceptance:**
    - Cache-hit (all axes fresh) short-circuits and runs no sources.
    - Cache-miss runs sources, merges, upserts, and returns a validated
      `company_research` artifact (`assertArtifact` passes).
    - One source throwing/returning `{}` still yields the other source's axes; result conforms to
      `companyResearchSummarySchema`.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

## Phase 4 — Progressive research card UI + read-only API

- [ ] T14 — Build the progressive `CompanyResearchCard` component + render test
  - **Files:** `apps/web/components/canvas/company-research-card.tsx` (NEW),
    `apps/web/components/canvas/company-research-card.test.tsx` (NEW)
  - **Acceptance:**
    - Card uses `@ever-hust/ui` `Card`/`Badge` + `cn()`, modelled on `salary-insights-card.tsx`;
      renders a skeleton when axes are absent and fills each axis independently as data arrives
      (progressive).
    - Each populated field shows a provenance chip (source + relative age); unknown fields render an
      explicit "not available" state (never blank-as-known).
    - Render test asserts skeleton-first, then field + provenance chip on data; `error` state
      renders a friendly message.
  - **Estimate:** 1 day

- [ ] T15 — Wire the canvas-sync case + canvas state
  - **Files:** `apps/web/hooks/use-canvas-sync.ts` (add `case "companyResearch"`, `companyResearch`
    state, `clearCompanyResearch`), `apps/web/app/(dashboard)/chat/page.tsx` (render the card)
  - **Acceptance:**
    - `handleToolResult("companyResearch", result)` sets `companyResearch` canvas state when the
      result has axes or an `error`; `clearCompanyResearch` resets it (mirrors `salaryInsights`).
    - `chat/page.tsx` renders `CompanyResearchCard` from canvas state as an overlay card.
    - Existing canvas-sync tests still pass; a new case test asserts state update.
  - **Estimate:** 0.5 day

- [ ] T16 — Read-only research hydration API route + tests
  - **Files:** `apps/web/app/api/companies/[company]/research/route.ts` (NEW),
    `apps/web/lib/api-schemas.ts` (add param schema),
    `apps/web/app/api/companies/[company]/research/route.test.ts` (NEW)
  - **Acceptance:**
    - GET handler calls `requireSessionUser()` then `applyRateLimit(userId, "authenticated")`,
      validates the `[company]` param with a Zod schema from `api-schemas.ts`, reads the cache
      (`getCachedResearch`) and returns the validated artifact; errors via `apiBadRequest()` /
      `apiError()` from `api-response.ts`.
    - No mutation, no LLM call — pure cache read (Article 4 trivially satisfied).
    - Test covers: unauthenticated ⇒ 401-style response, invalid param ⇒ 400, cache hit ⇒ artifact.
  - **Estimate:** 1 day

## Phase 5 — Optional Ever Jobs firmographics source + E2E

- [ ] T17 — Add the optional Ever Jobs firmographics source (best-effort, graceful fallback)
  - **Files:** `packages/ai/src/company-research/sources/ever-jobs.ts` (NEW),
    `packages/ai/src/company-research/sources/ever-jobs.test.ts` (NEW)
  - **Acceptance:**
    - `everJobsSource` uses `everJobsClient` (`@ever-hust/jobs-api`) to fill firmographics axes where
      the API provides them, with `source:"ever-jobs"` provenance.
    - On API unavailability / missing fields it returns `{}` (no throw) so the merger falls back to
      `jobsTableSource` (graceful degradation — Article 2).
    - Tests (mocked client) cover the happy path and the unavailable-API fallback path.
  - **Estimate:** 1 day

- [ ] T18 — Register both sources + integrate the optional source behind the enricher
  - **Files:** `packages/ai/src/company-research/index.ts` (NEW — source registry),
    `packages/ai/src/company-research/index.test.ts` (NEW)
  - **Acceptance:**
    - The enricher runs `[jobsTableSource, everJobsSource]` (Ever Jobs optional/best-effort) and the
      tool consumes this registry; jobs-table source always present.
    - Test asserts the registry order and that removing `everJobsSource` leaves a working
      jobs-table-only card (Article 9 — independently disableable).
  - **Estimate:** 0.5 day

- [ ] T19 — Playwright E2E: card renders progressively with provenance
  - **Files:** `tests/e2e/company-research.spec.ts` (NEW)
  - **Acceptance:**
    - Against `http://localhost:8443`, asking the assistant to research a company surfaces the
      research card: skeleton appears first, then axes fill in, and at least one provenance chip is
      visible.
    - An unknown field renders its explicit "not available" state (no fabricated value).
    - `pnpm test:e2e` green for this spec.
  - **Estimate:** 1 day

- [ ] T20 — Full CI pass + zero-competitor self-check
  - **Files:** (whole epic diff)
  - **Acceptance:**
    - `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e` all green locally; CI green on
      `develop` (Article 10 §4).
    - `git diff` grepped for competitor names ⇒ empty (Article 11); only Ever brands appear.
    - `docs/specs/ROADMAP.md` epic-16 progress updated.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11). Sources
  are named by data class only (`jobs-table`, `ever-jobs`).
- Every AI artifact emits a Zod-validated summary alongside prose (Article 5); the
  `company_research` table jsonb mirrors that summary.
- `userId` is server-injected by the orchestrator — never an LLM-supplied param.
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
