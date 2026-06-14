# Spec #1 — Harvest the Ever Jobs Backend

> Status: Draft · Owner: Hust ← Ever Jobs · Effort: M (integration) · Phase 1 (independent quick win) · Depends on: —

## 1. Problem & user value

Hust already pays for the **Ever Jobs** sourcing backend (160+ sources, cross-source dedup,
liveness, salary normalization, market analytics), but **under-uses it**:

- The live user search (`searchJobs`) queries **Hust's own synced Postgres `jobs` table**, not the
  full Ever Jobs corpus.
- The 15-min sync (`packages/triggers/src/sync-jobs.ts`) pins **`country: "USA"`**, rotates a
  fixed set of `SEARCH_TERMS`, and uses an **11-value `siteType` enum** — a sliver of the 160+
  sources. It never passes **`companySlug`**, so the ~170 ATS plugins + hundreds of company-career
  plugins are dormant.
- Ever Jobs's default-on **cross-source dedup** never sees a multi-source corpus to collapse.
- **`/api/jobs/analyze`** (market analytics) is wired in the `jobs-api` client (`analyzeJobs()`)
  but **called nowhere**.

This epic unlocks all of that with **integration, not new backend** — wider supply, better
freshness, dedup, liveness, and market analytics for ~zero backend cost.

## 2. Scope

**In:**
- Widen the client `siteType` set (11 → the full Ever Jobs set) and stop hard-coding it.
- Pass **`companySlug`** to unlock ATS/company-direct depth.
- Drop the hard **`country: "USA"`** pin; make country/locale a parameter (default broad).
- Consume **`/api/jobs/analyze`** — surface market analytics (salary ranges, remote %, top
  companies, per-site comparison) in the UI + as context for evaluation/salary insights.
- Broaden the sync coverage (more terms/sites/countries) without overloading the schedule.

**Out (other epics / Ever Jobs-side):**
- Per-job **liveness on the search DTO** — that's [#4](../04-liveness-dto/spec.md) (small Ever Jobs
  change + Hust badge).
- Posting **legitimacy** signals — [#7](../07-legitimacy-radar/spec.md) (net-new Ever Jobs plugin).
- Optionally querying Ever Jobs **live** per user search (vs. the synced cache) — phase 2 of this
  epic if the synced approach proves limiting.

## 3. Design (all Hust-side integration)

1. **`siteType` coverage.** Replace the hard-coded 11-value client enum with the full supported set
   (or a pass-through), so search/sync can request the whole corpus. Keep a sensible default subset
   for the free tier; allow the full set for sync + pro.
2. **`companySlug`.** Thread the optional `companySlug` parameter through the `jobs-api` client and
   the sync, so ATS/company-direct sources are reachable. (Dedup activates automatically once
   multiple `siteType`s flow.)
3. **Drop USA-only.** Parameterize `country`/locale in `sync-jobs.ts` and the client; default to a
   broad set (or none) instead of `"USA"`. Geocoding stays Hust-side as today.
4. **Market analytics.** Call `EverJobsClient.analyzeJobs()` on a schedule (and/or on demand) and
   cache the result; surface it as: salary-insight enrichment, a "market" panel, and **context fed
   into [#3 evaluation](../03-evaluation-engine/spec.md)** (Comp/Demand block) and salary insights.
5. **Sync breadth.** Expand `SEARCH_TERMS` / sites / countries with care for rate + schedule;
   rely on Ever Jobs dedup to collapse overlap rather than de-duping Hust-side.

## 4. Data / API touchpoints

- `packages/jobs-api/` — widen `SiteEnum`, add `companySlug`, expose `analyzeJobs()` usage; the
  Ever Jobs API endpoint stays as configured (`EVER_JOBS_API_URL`).
- `packages/triggers/src/sync-jobs.ts` — drop `country:"USA"`, broaden params.
- Optional: a small `market_analytics` cache table (jsonb snapshot + `fetchedAt`) or reuse an
  existing cache; no removal of the existing `jobs` sync.
- No competitor anything here — this is entirely our **Ever Jobs** product surface.

## 5. Implementation plan

1. Audit the current `jobs-api` client surface (`SiteEnum`, search params, `analyzeJobs`).
2. Widen `siteType` + add `companySlug` (typed, optional) without breaking current callers.
3. Update `sync-jobs.ts`: remove the `country:"USA"` pin, broaden terms/sites; verify dedup is on.
4. Add an `analyzeJobs()` call path + cache; expose via a `getMarketInsights` tool/route.
5. Surface market analytics in the salary-insights UI + feed the evaluation Comp/Demand block.
6. Backfill/verify geocoding for the wider corpus.

## 6. Tasks

- [ ] Widen `SiteEnum` (11 → full) + keep a free-tier default subset.
- [ ] Add `companySlug` through client + sync.
- [ ] Remove hard `country:"USA"`; parameterize country/locale.
- [ ] Wire `analyzeJobs()` + cache (+ tool/route `getMarketInsights`).
- [ ] Feed market analytics into #3 (Comp/Demand) + salary insights UI.
- [ ] Tests: client param shaping (unit), sync params (unit), analyze cache (unit), E2E that
      `/api/jobs/search` returns multi-source results + a market panel renders.

## 7. Risks & acceptance

- **Risk:** wider sync → rate limits / volume → tune schedule + page sizes; lean on backend dedup.
- **Risk:** non-USA salary/locale normalization edge cases → Ever Jobs handles normalization;
  Hust just consumes (`enforceAnnualSalary` etc.).
- **Acceptance:** search returns results from more than the original 11 sites (incl. at least one
  ATS/company-direct via `companySlug`); non-USA jobs appear; `/api/jobs/analyze` is consumed and a
  market panel + salary insight render; CI green; **zero competitor references**.
