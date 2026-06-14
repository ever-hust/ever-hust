# Plan: 19b — Localized Comp / Benefit Knowledge Packs

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

Comp is market **semantics**, not a single number. A €70k Berlin offer and a $70k Austin
offer carry different statutory bonuses, severance norms, "deemed overtime" rules,
13th-month conventions, and equity expectations. Today every Hust comp surface
(`salaryInsightsTool`, and the planned #3 Comp/Demand block and #15 negotiation coach)
implicitly assumes US conventions — `salary-insights.ts` even defaults the dominant
currency to `"USD"`. This epic introduces a **versioned, per-market knowledge layer that is
data, not code**: `comp_knowledge_packs` rows that encode each market's comp/benefit
semantics, plus a thin, well-typed **pack loader** (`market → semantics`, with a generic
fallback) that the comp consumers read for the job's market.

The keystone constraint is that 19b is a **shared substrate**, not a feature with its own
UI surface. Its real value only lands when #3 (evaluation Comp/Demand) and #15 (negotiation)
read the pack. But those two epics are still upstream (their tools — `evaluate-job.ts`,
`negotiation-coach.ts` — do not yet exist on `develop`). So we sequence the work to deliver
**a stable, independently-shippable seam first**: the table, the seed packs, the loader, and
its own structured contract — all unit-testable today against the existing `jobs` table —
and then wire the consumers that exist now (`salaryInsightsTool`) while leaving documented,
typed integration points for #3/#15 to call when they land. The loader is the single
source of truth; consumers never read the table directly.

Packs are **versioned and upgrade independently of user data** (the two-layer contract from
#13): each `(market, version)` is immutable once published; a new version is a new row, and
the loader resolves the latest active version for a market at read time. Where a pack and a
user's own captured data conflict (e.g. the user states their real equity terms), **user
data wins** — the pack supplies market defaults and semantics, never overrides a fact the
user gave us (constitution Article 7, grounded / no-invent). When no pack exists for a
market, the loader returns a `generic` pack so consumers degrade gracefully rather than
falling back to silent US assumptions.

Markets are normalised to **ISO-3166 alpha-2 country codes** derived from the existing
`jobs.locationCountry` field (with `isRemote` handled as a "remote/unknown" market that maps
to `generic` unless the job also carries a country). Hust already indexes
`jobs_location_country_idx`, so resolving a job's market is a field read, not a new query
path. We seed a small set first — **US, DE, GB, IN** (mirroring the spec's example markets
and the currencies `salary-insights-card.tsx` already renders) — plus the `generic`
fallback; the table shape makes adding markets a seed/data change, never a deploy.

Structured output is non-negotiable (constitution Article 5): the pack semantics flow into
consumers as a **Zod-validated object**, and any AI artifact that cites pack data (the #3
Comp/Demand block, the #15 negotiation brief) keeps emitting its machine summary alongside
prose. We adopt the epic #5 contract (`packages/ai/src/structured/`) for the pack's
machine-readable shape — a `compKnowledgePackSchema` registered via `defineArtifact` — so
the pack is queryable and version-switchable the same way `evaluation` already is. Because
#3/#15 are not yet merged, 19b ships the loader + schema as the **stable interface they will
import**; no fork of their internals.

Standalone-first holds throughout (constitution Article 2): packs are static, Hust-owned
data seeded into Hust's own Postgres — there is **no Gauzy dependency and no live external
call** in the comp read path. The only external dependency remains the Ever Jobs API, and
even that is indirect: packs become *useful* once #1 drops the `country:"USA"` sync pin so a
non-US corpus exists to evaluate, but 19b does not block on #1 — the loader, schema, seeds,
and `salaryInsights` wiring are all testable against today's synced `jobs` rows (including
any non-US fixtures we add).

Testing follows Article 10: Jest unit tests are written **alongside** each task — pack
load/latest-version resolution, generic fallback, market normalisation, user-data-wins merge,
and a non-US fixture flowing market semantics through `salaryInsights` — and a Playwright E2E
asserts a non-US job's salary surface reflects its market (currency + statutory note) rather
than raw US assumptions. CI (lint, type-check, unit, E2E) must be green before merge; work
lands on `develop`.

## 2. Phases

### Phase 1 — Data spine (table + structured schema + seed packs)

- Goal: Persist versioned, per-market comp/benefit semantics as data, with a Zod machine
  summary, so consumers have a stable typed contract to read.
- Deliverables:
  - New Drizzle table `comp_knowledge_packs` in
    `packages/db/src/schema/comp-knowledge-packs.ts`, exported from
    `packages/db/src/schema/index.ts`, applied with `pnpm db:push`.
  - `compKnowledgePackSchema` in
    `packages/ai/src/structured/schemas/comp-knowledge-pack.ts` (registered via
    `defineArtifact`, schema version 1), exported from
    `packages/ai/src/structured/index.ts` — the queryable machine summary for pack
    `semantics` (statutory components, norms, equity conventions, severance, currency).
  - A seed of the starter markets (US, DE, GB, IN) + the `generic` fallback in
    `packages/db/src/seed-comp-packs.ts` (own entry, alongside the existing
    `packages/db/src/seed.ts`).
- Exit criteria: `pnpm db:push` applies cleanly; the table enforces unique
  `(market, version)` and indexes `market`; the seed populates 5 rows (4 markets +
  `generic`); schema/seed unit tests pass under `--selectProjects db`.

### Phase 2 — Pack loader (market → semantics, generic fallback, user-data-wins)

- Goal: A thin, fully unit-tested read layer that resolves a job's market to its latest
  active pack semantics, falls back to `generic`, and merges with user-supplied facts (user
  wins), with no LLM call.
- Deliverables:
  - `packages/ai/src/comp/market.ts` — `resolveMarket(job)` normalising
    `jobs.locationCountry` / `isRemote` to an ISO alpha-2 code or `generic`.
  - `packages/ai/src/comp/pack-loader.ts` — `loadCompPack(market)` returning the latest
    active `(market, version)` semantics (validated through `compKnowledgePackSchema`), with
    `generic` fallback; and `mergeUserComp(pack, userFacts)` implementing the two-layer
    contract (user data wins on conflict; pack supplies defaults only).
  - In-process memoisation of loaded packs (packs are immutable per version) so the read path
    stays a single query per market per request.
- Exit criteria: unit tests cover latest-version resolution, generic fallback for an unknown
  market, `isRemote`/null-country → `generic`, user-data-wins merge, and schema-validation of
  a malformed seed; all green under `--selectProjects ai` with no network.

### Phase 3 — Wire into comp consumers (salary insights now; #3/#15 seams)

- Goal: Make the existing comp surface market-aware, and expose documented integration points
  the upstream evaluation (#3) and negotiation (#15) tools call when they land.
- Deliverables:
  - `packages/ai/src/tools/salary-insights.ts` — resolve the dominant-market pack and use its
    `currency` + statutory semantics instead of the hard-coded `"USD"` default; attach a
    `marketContext` field (market, currency, statutory notes) to the returned object.
  - Extend `SalaryInsightsData` in
    `apps/web/components/canvas/salary-insights-card.tsx` with the optional `marketContext`
    and render a market/statutory note (additive — no removal of existing fields).
  - `case "salaryInsights"` in `apps/web/hooks/use-canvas-sync.ts` already routes the result;
    no new case needed — verify the extended shape flows through unchanged.
  - Document the comp-pack seam in `packages/ai/src/prompts.ts` (`getOrchestratorPrompt` +
    Langfuse `orchestrator-system`): when discussing comp for a non-US role, reason with the
    market's semantics surfaced in `marketContext`, never raw US assumptions.
  - Stable export surface for #3/#15: `loadCompPack`, `resolveMarket`, `mergeUserComp`, and
    `compKnowledgePackSchema` re-exported from `packages/ai/src/comp/index.ts` with TSDoc
    describing the Comp/Demand and negotiation read paths (no #3/#15 internals authored here).
- Exit criteria: `salaryInsights` for a non-US fixture returns that market's currency +
  statutory context (not USD); the card renders the market note; the orchestrator prompt
  documents the seam; the `packages/ai/src/comp/index.ts` interface is importable and typed.

### Phase 4 — E2E + hardening + docs

- Goal: Prove the non-US comp flow end-to-end in CI and lock the version/fallback guardrails.
- Deliverables:
  - Playwright spec `tests/e2e/localized-comp.spec.ts` — ask for salary insights on a non-US
    role (DE fixture) and assert the surfaced currency + market note reflect that market.
  - Fixture tests on a non-US `jobs` row asserting `resolveMarket` → pack → `salaryInsights`
    consistency.
  - A short `docs/specs/19b-localized-comp/` note (or `STRUCTURED_OUTPUT.md` addendum)
    documenting the pack schema, the two-layer (pack vs user-data) contract, and how to add a
    market by seeding a row.
  - ROADMAP progress update in `docs/specs/ROADMAP.md`.
- Exit criteria: unit + E2E green in CI; packs version independently of user data (a new
  version row is picked up without touching user rows); zero competitor references verified.

## 3. Packages Touched

| Package                                                       | Change                                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/comp-knowledge-packs.ts`              | NEW table `comp_knowledge_packs` (market × version × semantics jsonb); export from `packages/db/src/schema/index.ts`; `pnpm db:push` |
| `packages/db/src/schema/index.ts`                             | EXPORT `compKnowledgePacks` (+ `CompPackSemantics` type) — additive                                                                |
| `packages/db/src/seed-comp-packs.ts`                          | NEW seed for US / DE / GB / IN + `generic` fallback (data, not code)                                                               |
| `packages/ai/src/structured/schemas/comp-knowledge-pack.ts`   | NEW `compKnowledgePackSchema` via `defineArtifact` (schema version 1) — mirrors the table `semantics` shape                        |
| `packages/ai/src/structured/index.ts`                         | EXPORT `compKnowledgePackArtifact` / `compKnowledgePackSchema` — additive                                                          |
| `packages/ai/src/comp/market.ts`                              | NEW `resolveMarket(job)` (ISO alpha-2 from `jobs.locationCountry` / `isRemote`; `generic` fallback)                                |
| `packages/ai/src/comp/pack-loader.ts`                         | NEW `loadCompPack(market)` (latest active version + `generic` fallback) + `mergeUserComp` (user-data-wins)                          |
| `packages/ai/src/comp/index.ts`                               | NEW barrel re-exporting the loader/merge/schema seam for #3 (Comp/Demand) and #15 (negotiation) to import                          |
| `packages/ai/src/tools/salary-insights.ts`                    | Use the resolved pack's `currency` + statutory semantics instead of hard-coded `"USD"`; add `marketContext` to the return object   |
| `apps/web/components/canvas/salary-insights-card.tsx`         | EXTEND `SalaryInsightsData` with optional `marketContext`; render a market/statutory note (additive)                               |
| `apps/web/hooks/use-canvas-sync.ts`                           | VERIFY the existing `case "salaryInsights"` passes the extended shape through unchanged (no new case)                              |
| `packages/ai/src/prompts.ts`                                  | DOCUMENT the comp-pack seam in `getOrchestratorPrompt` (+ Langfuse `orchestrator-system`)                                          |
| `packages/jobs-api`                                           | (no change) — packs read already-synced `jobs.locationCountry`; non-US corpus is unlocked by #1, not 19b                          |
| `packages/db` (`@ever-hust/db`)                               | (consumed) — `db` lazy singleton for the loader query; no client change                                                            |
| `tests/e2e/localized-comp.spec.ts`                            | NEW Playwright E2E (non-US salary insights → market currency + note)                                                              |

## 4. Dependencies

| Library                | Version       | Rationale                                                                                          |
| ---------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `drizzle-orm`          | in repo       | `comp_knowledge_packs` table; latest-version query (`orderBy(version desc).limit(1)`) — no new dep  |
| `zod`                  | in repo       | `compKnowledgePackSchema` machine summary + runtime validation (Articles 5 / 8) — no new dep        |
| `@ever-hust/db`        | workspace     | `db` lazy singleton for the loader read; `comp_knowledge_packs` schema export                       |
| `@ever-hust/ai` (structured) | workspace | `defineArtifact` / `assertArtifact` from `packages/ai/src/structured/` (epic #5 contract)            |
| `@ever-hust/ui`        | workspace     | `card` / `badge` for the market-note render on `salary-insights-card.tsx`                            |

No new third-party direct dependencies are introduced (Article 10.5). Market data is seeded
in-repo, not pulled from any external comp provider.

### Upstream epic dependencies (assumed, not built here)

- **#5 structured-output** — hard contract dependency: `defineArtifact`/`assertArtifact` and
  `packages/ai/src/structured/`. Already on `develop` (used by `evaluation`); 19b reuses it
  directly. No shim needed.
- **#3 evaluation engine** — 19b exposes `loadCompPack`/`mergeUserComp` for the Comp/Demand
  block to consume; #3's `evaluate-job.ts` does not yet exist, so 19b ships the seam and
  documents the call site rather than editing a file that isn't there.
- **#15 negotiation** — same: the negotiation coach will anchor its market range via
  `loadCompPack`; 19b provides the typed entry point, #15 wires it when it lands.
- **#6 guardrails** — grounded / no-invent inherited: the loader supplies *market defaults*;
  any pack figure surfaced in an AI artifact must be cited as a market basis, never presented
  as the user's own number, and user-supplied facts always win (Article 7).
- **#1 harvest (non-US sync)** — packs are only *useful* once the `country:"USA"` sync pin is
  dropped and a non-US corpus exists; 19b is testable independently via non-US fixtures.

## 5. Risks & Mitigations

| Risk                                                                       | Likelihood | Impact | Mitigation                                                                                                          |
| -------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| #3 / #15 tools not yet on `develop` when 19b lands                         | H          | M      | Ship the loader + schema + `comp/index.ts` seam as the stable interface; wire only `salaryInsights` (exists today)  |
| Non-US corpus absent until #1 drops the `country:"USA"` pin                | M          | M      | Test against non-US `jobs` fixtures; loader/seed/`salaryInsights` are independent of live sync breadth              |
| Pack `semantics` schema drifts from real market nuance                     | M          | M      | Versioned `(market, version)` rows + `compKnowledgePackSchema` gate; add nuance as a new version, never a hot edit  |
| Pack figure overrides a real user fact (invents comp)                      | L          | H      | `mergeUserComp` is user-data-wins by construction; unit-tested; pack supplies defaults only (Article 7)             |
| Market mis-resolution (dirty `locationCountry`, remote-only)               | M          | M      | `resolveMarket` normalises to ISO alpha-2 and falls back to `generic`; remote/null → `generic`, never a wrong US default |
| Currency assumption stays USD in `salary-insights.ts`                      | M          | M      | Replace the hard-coded `"USD"` default with the resolved pack currency; covered by the non-US fixture unit test     |
| Seeding many markets becomes code-heavy                                    | L          | L      | Markets are seed rows (data); start with 4 + generic; adding a market is a seed/data change, no deploy              |
| Stale pack version served after a publish                                  | L          | M      | Loader resolves latest active version per read with per-version memoisation only (immutable rows); no cross-version cache |

## 6. Rollback Plan

- The feature is additive and seam-gated. To disable consumer behaviour: revert
  `packages/ai/src/tools/salary-insights.ts` to its hard-coded currency path — the
  `marketContext` field is optional on `SalaryInsightsData`, so the card simply stops
  rendering the market note (no UI break).
- The `comp_knowledge_packs` table and its seed are **new and additive** — no existing table
  is altered, so reverting code leaves the rows intact (no data loss). Drop the table only on
  an explicit decision; the loader's `generic` fallback already handles an empty table.
- The `packages/ai/src/comp/*` loader and `compKnowledgePackSchema` are unreferenced by #3/#15
  until those epics import them; removing 19b's `salaryInsights` wiring leaves the loader inert
  with zero blast radius.
- The orchestrator prompt change is text-only; reverting the comp-pack paragraph in
  `packages/ai/src/prompts.ts` (and the Langfuse `orchestrator-system` prompt) restores prior
  behaviour without code changes.

## 7. Migration Plan

- No data migration is required: `comp_knowledge_packs` starts empty and is populated by
  `pnpm db:push` + the new comp-pack seed. Until seeded, the loader returns `generic`.
- `pnpm db:push` applies the new table (push-based, per `drizzle.config.ts`).
- Seeding a new market later is a **data change** — add a `(market, version)` row; the loader
  picks it up at read time with no deploy. Publishing a corrected pack is a **new version
  row**, never an in-place edit, so existing user data and prior evaluations are untouched
  (two-layer contract, #13).
- Existing consumers are unaffected: `salary-insights.ts` keeps working for US/unknown
  markets via the `generic`/USD path until a market pack resolves; `jobs`, `users`,
  `evaluations` are read as-is. No backfill of historical salary insights.

## 8. Open Questions for Plan

1. **Market key granularity.** Country-level (ISO alpha-2) for MVP. Sub-national markets
   (e.g. US state, IN metro) carry real comp variance — confirm country-level is acceptable
   for MVP and sub-national is a later pack-key extension, not a schema change.
2. **`semantics` shape.** Plan models `semantics` as `{ currency, statutoryComponents[],
   norms, equityConventions, severance, thirteenthMonth }` validated by
   `compKnowledgePackSchema`. Confirm the field set with #3 (Comp/Demand) and #15 so the seam
   is stable before those epics import it.
3. **User-fact source.** `mergeUserComp` needs a defined shape for user-supplied comp facts
   (likely a key under `users.preferences`). Confirm where the user's real offer/equity terms
   live so the user-data-wins merge has a concrete input.
4. **Remote-job market.** A fully remote, country-less job resolves to `generic`. Confirm that
   is correct vs inferring the user's own country as the comp market.
5. **Pack authorship / governance.** Seeds are hand-authored market data. Confirm the review
   path for adding/updating a market pack (data PR) and who signs off on a market's semantics.
6. **Org override.** Should orgs override a market pack (mirroring
   `organizationAiConfigs.enabledTools` style) in MVP, or is that deferred? Plan defers it
   (additive later via an `organizationAiConfigs` JSON key), keeping 19b user-/market-scoped.
