# Tasks: 01 — Harvest the Ever Jobs Backend

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Widen the `jobs-api` client contract

- [ ] T01 — Widen `SiteEnum` + add free-tier default subset
  - **Files:** `packages/jobs-api/src/types.ts`, `packages/jobs-api/src/index.ts` (re-export)
  - **Acceptance:**
    - `SiteEnum` expanded from the current 11 values to the full supported Ever Jobs set (keep the existing 11 as members; add the rest).
    - New exported `FREE_TIER_SITES` constant (a sensible subset of `SiteEnum`) is added and re-exported from `src/index.ts`.
    - `ScraperInputSchema.siteType` still accepts `SiteEnum[]` and remains optional; existing callers compile unchanged.
    - `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T02 — Relax the hard `country` default + describe `companySlug`
  - **Files:** `packages/jobs-api/src/types.ts`
  - **Acceptance:**
    - `country` no longer silently defaults to `"USA"` in `ScraperInputSchema` (callers pass it explicitly; absence means broad/no pin).
    - `companySlug` gains a `.describe(...)` documenting ATS/company-direct unlock; remains optional.
    - No existing call site relying on the old default breaks (audit `sync-jobs.ts` + `api/jobs/sync/route.ts` — they pass `country` explicitly in T05/T06).
  - **Estimate:** 0.5 day

- [ ] T03 — Unit tests for the widened client contract
  - **Files:** `packages/jobs-api/src/types.test.ts`, `packages/jobs-api/src/client.test.ts`
  - **Acceptance:**
    - Test asserts `SiteEnum` includes the new members and `FREE_TIER_SITES` ⊆ `SiteEnum`.
    - Test asserts `ScraperInputSchema` parses an input with multi-`siteType` + `companySlug` + a non-USA `country`.
    - `client.test.ts` asserts `companySlug`, `siteType`, and `country` serialise into the POST body of `searchJobs` (mock `fetch`).
    - `pnpm test -- --selectProjects jobs-api` green.
  - **Estimate:** 0.5 day

## Phase 2 — Broaden the sync coverage

- [ ] T04 — Add country + company-slug rotation lists
  - **Files:** `packages/triggers/src/map-job.ts`
  - **Acceptance:**
    - New exported `SYNC_COUNTRIES` (broad set) and optional `COMPANY_SLUGS` arrays added beside `SEARCH_TERMS`.
    - Lists are non-empty and documented; no removal of `SEARCH_TERMS`.
  - **Estimate:** 0.5 day

- [ ] T05 — Thread `siteType`/`country`/`companySlug` through the Trigger.dev sync
  - **Files:** `packages/triggers/src/sync-jobs.ts`
  - **Acceptance:**
    - Removes the hard `country: "USA"` literal; rotates a `{ searchTerm, country, siteType, companySlug }` config per 15-min tick.
    - Passes the widened `siteType` set (full or `FREE_TIER_SITES` per design) and an optional rotated `companySlug`.
    - Per-tick result caps preserved (no fan-out); upsert-by-`externalId` logic unchanged so Ever Jobs dedup collapses overlap.
    - `pnpm check-types` green.
  - **Estimate:** 1 day

- [ ] T06 — Mirror the broadened params in the manual sync route
  - **Files:** `apps/web/app/api/jobs/sync/route.ts`
  - **Acceptance:**
    - Accepts optional `country`, `siteType`, `companySlug` in the request body (validated/clamped like the existing `resultsWanted`).
    - Drops the hard `country: "USA"`; when body omits `country`, uses the broad default.
    - Returns `apiSuccess(...)` with the resolved params; errors via `apiError(...)`.
  - **Estimate:** 0.5 day

- [ ] T07 — Unit tests for sync rotation + param shaping
  - **Files:** `packages/triggers/src/map-job.test.ts`, `packages/triggers/src/sync-jobs.test.ts` (new)
  - **Acceptance:**
    - Test asserts `SYNC_COUNTRIES`/`COMPANY_SLUGS` are non-empty and rotate deterministically by tick index.
    - Test asserts the sync builds a `ScraperInput` with the widened `siteType`, a non-USA `country`, and an optional `companySlug` (mock `everJobsClient.searchJobs`).
    - `pnpm test -- --selectProjects triggers` green.
  - **Estimate:** 0.5 day

## Phase 3 — Consume market analytics (cache + tool + route)

- [ ] T08 — Create the `market_analytics` cache schema
  - **Files:** `packages/db/src/schema/market-analytics.ts`, `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table follows house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`; `text("query").notNull()`; `jsonb("snapshot").$type<MarketSnapshot>()`; `timestamp("fetched_at").notNull().defaultNow()`; index on `query`.
    - Exported `marketAnalytics` from `schema/index.ts`.
    - No changes to existing tables.
  - **Estimate:** 0.5 day

- [ ] T09 — Apply the schema with `pnpm db:push` + schema test
  - **Files:** `packages/db/src/schema/market-analytics.test.ts`, (runtime) `pnpm db:push`
  - **Acceptance:**
    - `pnpm db:push` applies the new table with no diff on existing tables.
    - Test asserts column names/types and the presence of the `query` index.
    - `pnpm test -- --selectProjects db` green.
  - **Estimate:** 0.5 day

- [ ] T10 — Add the `refresh-market-analytics` Trigger.dev task
  - **Files:** `packages/triggers/src/refresh-market-analytics.ts`
  - **Acceptance:**
    - Task calls `everJobsClient.analyzeJobs(input)` for the rotation terms and upserts `{ query, snapshot, fetchedAt }` into `marketAnalytics` (conflict on `query`).
    - Runs on its own (slower) cron — does not piggy-back the 15-min `sync-jobs` tick (OQ-3 default).
    - Failures are non-fatal per-term (logged, loop continues), mirroring `sync-jobs.ts`.
    - `pnpm check-types` green.
  - **Estimate:** 1 day

- [ ] T11 — Add the read-only `getMarketInsights` AI tool
  - **Files:** `packages/ai/src/tools/get-market-insights.ts`, `packages/ai/src/tools/index.ts`
  - **Acceptance:**
    - `tool({ description, inputSchema: z.object({...}).max()-bounded, execute })` — input `jobTitle`(max 200)/optional `location`(max 200); read-only (no writes, no apply/send).
    - `execute` reads the latest `marketAnalytics` snapshot for the query and returns a strict structured object (median/range, remote %, top companies, per-site comparison) alongside a graceful `{ hasData: false }` when no snapshot exists.
    - `userId` is NOT an input param (no user-scoped data here).
    - Exported from `tools/index.ts`.
  - **Estimate:** 1 day

- [ ] T12 — Register `getMarketInsights` in the orchestrator
  - **Files:** `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - Added to the `tools: { ... }` object inside `streamText` (read-only — no rate-limit wrapper required; free per OQ-2 default).
    - Imported from `../tools`; `stopWhen: stepCountIs(5)` unchanged.
    - `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T13 — Document `getMarketInsights` in the system prompt
  - **Files:** `packages/ai/src/prompts.ts`
  - **Acceptance:**
    - `DEFAULT_ORCHESTRATOR_PROMPT` gains a `getMarketInsights` bullet under "Your Capabilities" + a short usage section (when to call, how to present).
    - Note added that the Langfuse `orchestrator-system` (label `production`) prompt must be updated to match (migration step).
    - `pnpm test -- --selectProjects ai` (prompts.test.ts) green.
  - **Estimate:** 0.5 day

- [ ] T14 — Add the `GET /api/market` read route
  - **Files:** `apps/web/app/api/market/route.ts`, `apps/web/lib/api-schemas.ts`
  - **Acceptance:**
    - Uses `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, Zod query validation from `lib/api-schemas.ts`, errors via `apiBadRequest()`/`apiError()`.
    - Returns the cached `marketAnalytics` snapshot for a `jobTitle`/`location` query; empty payload when none.
    - Default `Cache-Control` headers per the route convention.
  - **Estimate:** 0.5 day

- [ ] T15 — Unit tests for the tool + route schema
  - **Files:** `packages/ai/src/tools/get-market-insights.test.ts`, `apps/web/lib/api-schemas.test.ts` (extend)
  - **Acceptance:**
    - Tool test: returns a structured snapshot when the cache has a row; returns `{ hasData: false }` (no throw) when empty; input Zod `.max()` bounds enforced.
    - Route-schema test: the new market query schema parses valid input and rejects over-long strings.
    - `pnpm test -- --selectProjects ai web-lib` green.
  - **Estimate:** 0.5 day

## Phase 4 — Surface analytics in canvas + feed evaluation

- [ ] T16 — Build the `MarketInsightsCard` component
  - **Files:** `apps/web/components/canvas/market-insights-card.tsx`
  - **Acceptance:**
    - Modelled on `salary-insights-card.tsx`; ShadCN via `@ever-hust/ui/card`, `@ever-hust/ui/badge`, `cn` from `@ever-hust/ui/lib/utils`.
    - Renders median/range, remote %, top companies, per-site comparison; hides gracefully when `hasData: false`.
    - Exposes a `MarketInsightsData` type matching the tool's return shape.
  - **Estimate:** 1 day

- [ ] T17 — Wire the tool result through `use-canvas-sync`
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - New `marketInsights: MarketInsightsData | null` slice on `CanvasState`.
    - New `case "getMarketInsights"` in `handleToolResult` sets the slice only when `hasData` (mirrors the `salaryInsights` `sampleSize>0` guard).
    - New `clearMarketInsights` callback returned from the hook.
  - **Estimate:** 0.5 day

- [ ] T18 — Render the card on the chat canvas
  - **Files:** `apps/web/app/(dashboard)/chat/page.tsx`, `apps/web/components/canvas/jobs-canvas.tsx`
  - **Acceptance:**
    - `MarketInsightsCard` renders as an overlay/panel (like the salary-insights card) when `marketInsights` is set, with a dismiss wired to `clearMarketInsights`.
    - No layout regression to the existing jobs canvas / dashboard toggle.
    - `pnpm lint` + `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T19 — Feed cached analytics into salary insights + expose Comp/Demand context
  - **Files:** `packages/ai/src/tools/salary-insights.ts`
  - **Acceptance:**
    - `salaryInsightsTool` reads the latest `marketAnalytics` snapshot (when present) and adds a market annotation field to its structured result (additive — existing fields unchanged).
    - Exported `getMarketContext(jobTitle, location?)` helper returns the cached Comp/Demand block for epic #3 (evaluation engine) to consume.
    - Tests updated in `packages/ai/src/tools/salary-insights.test.ts` (annotation present when cache hit; absent when miss).
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

- [ ] T20 — E2E: multi-source results + market panel
  - **Files:** `tests/e2e/jobs.spec.ts`
  - **Acceptance:**
    - E2E asserts the jobs canvas renders results spanning more than the original 11 sites (incl. at least one ATS/company-direct via `companySlug`-seeded data).
    - E2E asserts a market panel/card renders after a market-insights interaction.
    - `pnpm test:e2e` green against `http://localhost:8443`.
  - **Estimate:** 1 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Every new AI tool is **read-only** — nothing here applies, submits, or sends (human-in-the-loop, Article 4 preserved).
- Every AI artifact emits a Zod-validated structured object alongside prose (Article 5); align `getMarketInsights` to epic #5's shared contract (OQ-1).
- The only external dependency added is the existing Ever Jobs API (Article 2 standalone-first); no Gauzy dependency.
- DB change is additive (`market_analytics` only) and applied with `pnpm db:push`; update the Langfuse `orchestrator-system` prompt to match `prompts.ts`.
- Verify **zero competitor references** before every commit (constitution Article 11).
- Update `docs/specs/ROADMAP.md` progress when this epic's tasks complete.
