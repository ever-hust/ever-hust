# Plan: 01 — Harvest the Ever Jobs Backend

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

This epic is **pure integration, not new backend**. Hust already pays for the Ever Jobs
sourcing backend (160+ sources, cross-source dedup, liveness, salary normalisation, market
analytics) but under-uses it: the client (`packages/jobs-api/src/types.ts`) pins an 11-value
`SiteEnum`, the sync (`packages/triggers/src/sync-jobs.ts`) hard-codes `country: "USA"` and
never passes `companySlug`, and the `analyzeJobs()` market-analytics endpoint already wired in
`packages/jobs-api/src/index.ts` is called nowhere. We unlock all of that by widening the
typed contract, threading the dormant parameters through the sync, and consuming the analytics
endpoint behind a new AI tool + cache table + canvas card.

The work is sequenced in four phases so each lands independently and CI-green. **Phase 1**
widens the `jobs-api` client surface (full `SiteEnum`, optional `companySlug`, drop the hard
`country` pin) without breaking existing callers — every change is additive and the defaults
stay backwards-compatible. **Phase 2** broadens the Trigger.dev sync
(`packages/triggers/src/sync-jobs.ts` + the mirrored `apps/web/app/api/jobs/sync/route.ts`)
to request more sites/countries and to pass `companySlug`, relying on Ever Jobs' default-on
cross-source dedup to collapse overlap rather than de-duping Hust-side. **Phase 3** adds the
market-analytics path: a new `market_analytics` cache table in `packages/db`, a Trigger.dev
refresh task that calls `everJobsClient.analyzeJobs()`, a read-only `getMarketInsights` AI tool
registered in the orchestrator, and a public read route. **Phase 4** surfaces the analytics in
the canvas (a `MarketInsightsCard` modelled on `salary-insights-card.tsx`, wired through
`use-canvas-sync.ts`) and feeds the cached snapshot into the salary-insights tool and as
Comp/Demand context for the downstream evaluation engine (epic #3).

The contract that every AI artifact emits is governed by **structured-output (epic #5)**: the
new `getMarketInsights` tool returns a strict, Zod-shaped object alongside any prose, exactly
as `salaryInsightsTool` does today. The cached snapshot the tool reads is the source of truth
for the canvas card and for the Comp/Demand block this plan hands to epic #3. Because the
upstream structured-output contract may still be settling, the tool's return type is defined
locally in Phase 3 and aligned to the shared schema in Phase 4 (Open Question OQ-1).

Standalone-first is preserved: the **only** new external call is to the Ever Jobs API we
already depend on (`packages/jobs-api/`). No Gauzy dependency is introduced. Human-in-the-loop
is unaffected — every tool added here is **read-only** (search/analytics); nothing applies,
submits, or sends. Grounding holds because analytics are computed by Ever Jobs over the real
corpus and merely surfaced; Hust invents nothing.

All work follows the house stack: TypeScript, pnpm, Node 24, Jest (`*.test.ts` alongside
source) + Playwright (`tests/e2e/*.spec.ts`), DB changes applied with `pnpm db:push`. Tests
are written alongside each task, never batched. CI must be green before merge; work lands on
`develop`.

## 2. Phases

### Phase 1 — Widen the `jobs-api` client contract

- **Goal:** Expose the full Ever Jobs source set and the dormant `companySlug` parameter, and
  stop hard-coding `country`, without breaking any current caller.
- **Deliverables:**
  - `SiteEnum` in `packages/jobs-api/src/types.ts` widened from the 11-value list to the full
    supported set (or a pass-through string), with a `FREE_TIER_SITES` default subset exported
    for the free tier.
  - `companySlug` confirmed/typed on `ScraperInputSchema` (already present — add `.describe()`
    and a test asserting it serialises into the POST body).
  - `country` default relaxed: keep `"USA"` as an explicit caller-supplied value, not a schema
    default that silently narrows the corpus.
  - Unit tests in `packages/jobs-api/src/types.test.ts` + `client.test.ts` for the new shapes.
- **Exit criteria:** `pnpm test -- --selectProjects jobs-api` green; `pnpm check-types` green;
  existing `searchJobs`/`analyzeJobs` callers compile unchanged.

### Phase 2 — Broaden the sync coverage

- **Goal:** Make the 15-min sync reach beyond 11 sites and the USA, including ATS/company-direct
  sources via `companySlug`, without overloading the schedule or rate limits.
- **Deliverables:**
  - `packages/triggers/src/sync-jobs.ts`: remove the `country: "USA"` pin; accept a rotated
    `{ siteType, country, companySlug }` config; pass the widened `siteType` set.
  - A `SYNC_COUNTRIES` (and optional `COMPANY_SLUGS`) rotation list added next to `SEARCH_TERMS`
    in `packages/triggers/src/map-job.ts`.
  - `apps/web/app/api/jobs/sync/route.ts` (the local mirror) updated to accept the same optional
    `country`/`siteType`/`companySlug` body fields and drop the hard `country: "USA"`.
  - Unit tests for the rotation/param-shaping in `packages/triggers/src/` (`map-job.test.ts`).
- **Exit criteria:** `pnpm test -- --selectProjects triggers` green; a manual `POST /api/jobs/sync`
  with a non-USA country and a `companySlug` upserts rows from more than the original 11 sites;
  dedup confirmed on (no duplicate `externalId` collisions Hust-side).

### Phase 3 — Consume market analytics (cache + tool + route)

- **Goal:** Call `everJobsClient.analyzeJobs()` on a cadence, cache the snapshot, and expose it
  through a read-only AI tool and a read route.
- **Deliverables:**
  - New table `packages/db/src/schema/market-analytics.ts` (jsonb snapshot + `query` key +
    `fetchedAt`), exported from `packages/db/src/schema/index.ts`; applied via `pnpm db:push`.
  - New Trigger.dev task `packages/triggers/src/refresh-market-analytics.ts` that calls
    `everJobsClient.analyzeJobs()` for the rotation terms and upserts the cache.
  - New tool `packages/ai/src/tools/get-market-insights.ts` (read-only; Zod-bounded input;
    returns a structured object), exported from `packages/ai/src/tools/index.ts` and registered
    in `packages/ai/src/agents/orchestrator.ts`.
  - System-prompt update in `packages/ai/src/prompts.ts` documenting `getMarketInsights`.
  - New read route `apps/web/app/api/market/route.ts` (`requireSessionUser`, `applyRateLimit`,
    Zod from `apps/web/lib/api-schemas.ts`, errors via `apps/web/lib/api-response.ts`).
  - Unit tests: `packages/ai/src/tools/get-market-insights.test.ts`, schema test in
    `packages/db/src/schema/`, route schema test in `apps/web/lib/`.
- **Exit criteria:** `pnpm db:push` applies the table; `pnpm test -- --selectProjects ai db web-lib`
  green; the tool returns a cached snapshot when present and a graceful empty object when not.

### Phase 4 — Surface analytics in canvas + feed evaluation

- **Goal:** Render market analytics on the jobs canvas and make the cached snapshot available
  to salary insights and to the evaluation engine's Comp/Demand block.
- **Deliverables:**
  - New component `apps/web/components/canvas/market-insights-card.tsx` (modelled on
    `salary-insights-card.tsx`, ShadCN via `@ever-hust/ui`).
  - `apps/web/hooks/use-canvas-sync.ts`: new `marketInsights` state slice + a
    `case "getMarketInsights"` branch in `handleToolResult` + a `clearMarketInsights` callback;
    render the card in `apps/web/app/(dashboard)/chat/page.tsx` / `jobs-canvas.tsx`.
  - `packages/ai/src/tools/salary-insights.ts`: read the cached market snapshot (when present)
    to annotate the salary result; export a typed `getMarketContext()` helper for epic #3 to
    consume as the Comp/Demand block.
  - Playwright E2E `tests/e2e/jobs.spec.ts` (extend) asserting multi-source results render and a
    market panel appears.
- **Exit criteria:** `pnpm test:e2e` green; the market card renders in the browser; salary
  insights show the market annotation; `pnpm lint` + `pnpm check-types` green; **zero competitor
  references** verified.

## 3. Packages Touched

| Package                                            | Change                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/jobs-api`                                | Widen `SiteEnum` + `FREE_TIER_SITES` in `src/types.ts`; relax `country` default; `.describe()` `companySlug`; tests in `src/types.test.ts`, `src/client.test.ts`. |
| `packages/triggers`                                | `src/sync-jobs.ts` drop USA pin + thread `siteType`/`country`/`companySlug`; `src/map-job.ts` add `SYNC_COUNTRIES`/`COMPANY_SLUGS`; new `src/refresh-market-analytics.ts`; tests `src/map-job.test.ts`. |
| `packages/db`                                      | New `src/schema/market-analytics.ts`; export in `src/schema/index.ts`; `pnpm db:push`; schema test.            |
| `packages/ai`                                      | New tool `src/tools/get-market-insights.ts`; export in `src/tools/index.ts`; register in `src/agents/orchestrator.ts`; document in `src/prompts.ts`; salary annotation + `getMarketContext()` in `src/tools/salary-insights.ts`; tests `src/tools/get-market-insights.test.ts`. |
| `apps/web` (API)                                   | New `app/api/market/route.ts`; `app/api/jobs/sync/route.ts` accept country/site/slug; schema in `lib/api-schemas.ts`; errors via `lib/api-response.ts`. |
| `apps/web` (UI)                                    | New `components/canvas/market-insights-card.tsx`; `hooks/use-canvas-sync.ts` new case + state; render in `app/(dashboard)/chat/page.tsx` / `components/canvas/jobs-canvas.tsx`. |
| `apps/web` (tests)                                 | Extend `tests/e2e/jobs.spec.ts`; route-schema unit test under `apps/web/lib/`.                                 |
| `packages/ui`                                      | (no change) — reuse existing `card`, `badge`, `lib/utils` exports.                                             |

## 4. Dependencies

| Library / Epic                  | Version  | Rationale                                                                                  |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| (no new npm deps)               | —        | Entirely integration over the existing `@ever-hust/jobs-api` client, Drizzle, AI SDK v6, Trigger.dev v3. |
| Ever Jobs API                   | current  | The only hard external dependency (Article 2). `analyzeJobs()` + widened `searchJobs` params already supported server-side. |
| Epic #5 — structured output     | upstream | Shared Zod contract every AI artifact emits. `getMarketInsights` aligns to it (OQ-1).      |
| Epic #3 — evaluation engine     | downstream | Consumes the cached snapshot via `getMarketContext()` for its Comp/Demand block.          |
| Epic #6 — guardrails            | upstream | Grounded/no-invent helpers; market analytics are computed by Ever Jobs and only surfaced.  |

## 5. Risks & Mitigations

| Risk                                                        | Likelihood | Impact | Mitigation                                                                                     |
| ---------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| Wider sync (more sites/countries) → Ever Jobs rate-limits  | M          | H      | Rotate one config per 15-min tick (not fan-out); rely on the client's existing circuit breaker + retry in `packages/jobs-api/src/index.ts`; tune `resultsWanted`/`pageSize`. |
| Higher upsert volume slows the sync / DB                    | M          | M      | Keep per-tick result caps; lean on Ever Jobs dedup so Hust upserts collapsed rows by `externalId`. |
| `getMarketInsights` called with no cached snapshot          | M          | L      | Tool returns a graceful empty/`hasData:false` object (mirrors `salaryInsightsTool` error shape); card hides when empty (mirrors `salaryInsights` `sampleSize>0` guard). |
| Non-USA salary/locale normalisation edge cases             | M          | M      | Ever Jobs owns normalisation (`enforceAnnualSalary`); Hust only consumes — no Hust-side currency maths beyond existing `salary-helpers`. |
| Structured-output contract (epic #5) still shifting         | M          | M      | Define the tool return type locally first; align in Phase 4 behind OQ-1 so Phase 1–3 don't block. |
| Widened `SiteEnum` breaks a free-tier expectation           | L          | M      | Keep `FREE_TIER_SITES` default subset; full set gated to sync + Pro (`subscriptionStatus in ('active','past_due')`). |
| New table push to shared Supabase                           | L          | M      | `pnpm db:push` is additive (new table only); no column drops; rollback = drop the new table.   |

## 6. Rollback Plan

Every change is additive and flag-light:

- **Phase 1–2 (client/sync):** revert `siteType`/`country`/`companySlug` widening; the schema
  defaults restore the prior 11-site, USA-pinned behaviour. No data migration needed.
- **Phase 3 (tool/route/cache):** unregister `getMarketInsights` from
  `packages/ai/src/agents/orchestrator.ts` and remove its export; delete
  `apps/web/app/api/market/route.ts`; pause/remove the `refresh-market-analytics` Trigger task.
  The `market_analytics` table is read-only cache — dropping it loses no user data.
- **Phase 4 (canvas):** remove the `case "getMarketInsights"` branch in `use-canvas-sync.ts`
  and the `MarketInsightsCard` render; salary insights fall back to their current behaviour.

No user-stateful data is created by this epic, so rollback is non-destructive throughout.

## 7. Migration Plan

- **DB:** one new table `market_analytics` applied with `pnpm db:push` (Phase 3). Additive only —
  no changes to `jobs`, `users`, or any existing table; no backfill required because the cache
  populates itself on the first `refresh-market-analytics` run.
- **Consumers:** existing `searchJobs`/`analyzeJobs` callers continue to work because the widened
  `SiteEnum` and relaxed `country` keep backwards-compatible defaults; the sync's new optional
  config fields default to today's behaviour when unset.
- **System prompt:** Langfuse prompt `orchestrator-system` (label `production`) must add the
  `getMarketInsights` description to match the local fallback in `packages/ai/src/prompts.ts`
  (documented in the prompt-update task; local fallback ships in the same PR).

## 8. Open Questions for Plan

- **OQ-1:** Should `getMarketInsights`' return type be defined locally now and aligned to epic
  #5's shared structured-output schema in Phase 4, or block on #5 landing first? (Plan assumes
  local-first, align later.)
- **OQ-2:** Is `getMarketInsights` free-tier or Pro-gated? (Default assumption: read-only and
  free, like `salaryInsights`; revisit if analytics prove costly.)
- **OQ-3:** Refresh cadence for `refresh-market-analytics` — its own schedule, or piggy-back on
  the 15-min `sync-jobs` tick? (Default: a separate, slower cron to avoid competing for the
  Ever Jobs rate budget.)
- **OQ-4:** Full enumerated `SiteEnum` vs. a pass-through `z.string()` for `siteType` — does the
  Ever Jobs API validate site names server-side? (Default: keep an enum of the documented set
  plus an escape hatch for `companySlug`-driven ATS sources.)
