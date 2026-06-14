# Tasks: 19b — Localized Comp / Benefit Knowledge Packs

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Data spine (table + structured schema + seed packs)

- [ ] T01 — Add the `comp_knowledge_packs` Drizzle table
  - **Files:** `packages/db/src/schema/comp-knowledge-packs.ts` (new),
    `packages/db/src/schema/index.ts` (export `compKnowledgePacks` + `CompPackSemantics` type)
  - **Acceptance:**
    - Table follows house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`,
      `market text("market").notNull()` (ISO alpha-2 or `generic`),
      `version integer("version").notNull().default(1)`,
      `isActive boolean("is_active").notNull().default(true)`,
      `semantics jsonb("semantics").$type<CompPackSemantics>().notNull()`,
      `timestamp("created_at").notNull().defaultNow()` + `updated_at`.
    - `semantics` type captures: `currency`, `statutoryComponents[]`, `norms`,
      `equityConventions`, `severance`, `thirteenthMonth` (matches the spec §3 list).
    - Unique constraint on `(market, version)`; index `comp_knowledge_packs_market_idx` on
      `market` (and `(market, isActive)` for the latest-active lookup).
    - Exported from `packages/db/src/schema/index.ts`; no existing export removed.
  - **Estimate:** 0.5 day

- [ ] T02 — `pnpm db:push` the new table + schema-shape unit test
  - **Files:** `packages/db/src/schema/comp-knowledge-packs.test.ts` (new)
  - **Acceptance:**
    - `pnpm db:push` applies the table cleanly (push-based, per `drizzle.config.ts`).
    - Unit test asserts column names/types, the `(market, version)` unique constraint, the
      `market` index, and the enum/default values; green under
      `pnpm test -- --selectProjects db`.
  - **Estimate:** 0.5 day

- [ ] T03 — `compKnowledgePackSchema` structured artifact (epic #5 contract)
  - **Files:** `packages/ai/src/structured/schemas/comp-knowledge-pack.ts` (new),
    `packages/ai/src/structured/index.ts` (export),
    `packages/ai/src/structured/schemas/comp-knowledge-pack.test.ts` (new)
  - **Acceptance:**
    - `compKnowledgePackSchema` is a `.max()`-bounded `z.object(...)` mirroring the table
      `semantics` shape; registered via `defineArtifact("comp_knowledge_pack", 1, schema)`.
    - `COMP_KNOWLEDGE_PACK_SCHEMA_VERSION = 1` exported; type `CompKnowledgePack` inferred.
    - Unit test: a valid seed parses; a malformed pack (missing `currency`) fails
      `safeParse`; green under `--selectProjects ai`.
  - **Estimate:** 0.5 day

- [ ] T04 — Seed starter market packs (US / DE / GB / IN + `generic`)
  - **Files:** `packages/db/src/seed-comp-packs.ts` (new),
    `packages/db/src/seed-comp-packs.test.ts` (new)
  - **Acceptance:**
    - Seeds 5 rows: `US`, `DE`, `GB`, `IN` (version 1) + a `generic` fallback, each with
      correct `currency` (USD/EUR/GBP/INR) and market-specific `semantics` (e.g. DE statutory
      notice/severance, IN/GB conventions) — hand-authored market data only.
    - Each seed row validates against `compKnowledgePackSchema` before insert (no invalid seed
      can be written).
    - Idempotent: re-running upserts on `(market, version)` rather than duplicating.
    - Test asserts all 5 rows validate and `generic` is present; green under
      `--selectProjects db`.
  - **Estimate:** 1 day

## Phase 2 — Pack loader (market → semantics, generic fallback, user-data-wins)

- [ ] T05 — `resolveMarket(job)` market normaliser + unit test
  - **Files:** `packages/ai/src/comp/market.ts` (new),
    `packages/ai/src/comp/market.test.ts` (new)
  - **Acceptance:**
    - `resolveMarket(job)` maps `jobs.locationCountry` to an ISO alpha-2 code (handles common
      names/aliases, e.g. "United States" → `US`, "Germany" → `DE`).
    - A null/unknown country, or `isRemote === true` with no country, resolves to `generic`
      (never a silent `US` default).
    - Pure function, no DB/network; unit test covers US/DE/GB/IN, an alias, null country, and
      remote-only → `generic`; green under `--selectProjects ai`.
  - **Estimate:** 0.5 day

- [ ] T06 — `loadCompPack(market)` loader with latest-version + `generic` fallback
  - **Files:** `packages/ai/src/comp/pack-loader.ts` (new),
    `packages/ai/src/comp/pack-loader.test.ts` (new)
  - **Acceptance:**
    - `loadCompPack(market)` reads `comp_knowledge_packs` via `db` (`@ever-hust/db`), selects
      the latest active version for the market (`isActive`, `orderBy(version desc).limit(1)`),
      and validates it through `compKnowledgePackSchema` before returning.
    - Returns the `generic` pack when no row exists for the market; throws/logs per
      `assertArtifact` on a malformed row (dev throws, prod degrades to `generic`).
    - Per-version in-process memoisation (packs immutable per version); one query per market
      per request.
    - Unit test (mocked `db`): latest-version selection, unknown market → `generic`, malformed
      row handling; green under `--selectProjects ai`.
  - **Estimate:** 1 day

- [ ] T07 — `mergeUserComp(pack, userFacts)` two-layer (user-data-wins) merge + test
  - **Files:** `packages/ai/src/comp/pack-loader.ts` (extend),
    `packages/ai/src/comp/pack-loader.test.ts` (extend)
  - **Acceptance:**
    - `mergeUserComp(pack, userFacts)` returns market semantics where the pack supplies
      defaults and **any field the user actually provided overrides the pack** (constitution
      Article 7); absent user fields keep the pack default.
    - Never invents a user figure; a missing user fact leaves the pack default, not a
      fabricated value.
    - Unit test: user currency/equity overrides win; empty `userFacts` returns the pack
      unchanged; partial user facts merge field-by-field; green under `--selectProjects ai`.
  - **Estimate:** 0.5 day

- [ ] T08 — `packages/ai/src/comp/index.ts` seam barrel for #3 / #15
  - **Files:** `packages/ai/src/comp/index.ts` (new)
  - **Acceptance:**
    - Re-exports `resolveMarket`, `loadCompPack`, `mergeUserComp`, `compKnowledgePackSchema`,
      and the `CompKnowledgePack` type with TSDoc describing the #3 Comp/Demand and #15
      negotiation read paths.
    - `pnpm check-types` passes; the barrel is importable from `@ever-hust/ai`.
  - **Estimate:** 0.5 day

## Phase 3 — Wire into comp consumers (salary insights now; #3/#15 seams)

- [ ] T09 — Make `salaryInsights` market-aware (replace hard-coded USD default)
  - **Files:** `packages/ai/src/tools/salary-insights.ts` (edit),
    `packages/ai/src/tools/salary-insights.test.ts` (new or extend)
  - **Acceptance:**
    - The dominant market is resolved from the matched jobs' `locationCountry` and its pack is
      loaded via `loadCompPack`; the tool uses the pack's `currency` instead of the hard-coded
      `dominantCurrency = "USD"` default when a market pack resolves.
    - The returned object gains an optional `marketContext` field
      `{ market, currency, statutoryNotes }` derived from the pack semantics; the existing
      return shape (overall/byLevel/byWorkMode/topCompanies) is unchanged (additive).
    - `userId` is not introduced as an LLM param (the tool stays market-data-only).
    - Unit test: a non-US (DE) fixture returns `marketContext.currency === "EUR"` and a
      statutory note; a US/unknown fixture keeps prior behaviour; green under
      `--selectProjects ai`.
  - **Estimate:** 1 day

- [ ] T10 — Render the market/statutory note on the salary card
  - **Files:** `apps/web/components/canvas/salary-insights-card.tsx` (edit)
  - **Acceptance:**
    - `SalaryInsightsData` gains optional `marketContext`; when present, the card renders the
      market + currency + a short statutory note using `@ever-hust/ui/badge` / `card` and
      `cn()`; absent `marketContext` renders exactly as today (no layout break).
    - Currency formatting respects the pack currency (EUR/GBP/INR already handled by
      `currencySymbol`; extend the `switch` for INR if missing).
  - **Estimate:** 0.5 day

- [ ] T11 — Verify canvas-sync passes the extended shape; add coverage
  - **Files:** `apps/web/hooks/use-canvas-sync.ts` (verify),
    `apps/web/hooks/use-canvas-sync.test.ts` (new or extend, `web-lib` project)
  - **Acceptance:**
    - The existing `case "salaryInsights"` in `handleToolResult` forwards the extended
      `SalaryInsightsData` (incl. `marketContext`) into canvas state unchanged — no new case,
      no field dropped.
    - Test asserts a `salaryInsights` result carrying `marketContext` lands on
      `state.salaryInsights` intact; green under `--selectProjects web-lib`.
  - **Estimate:** 0.5 day

- [ ] T12 — Document the comp-pack seam in the orchestrator prompt
  - **Files:** `packages/ai/src/prompts.ts` (edit `DEFAULT_ORCHESTRATOR_PROMPT`),
    `packages/ai/src/prompts.test.ts` (extend)
  - **Acceptance:**
    - The system prompt gains a short comp-localization paragraph: when discussing comp for a
      non-US role, reason with the market's semantics from `marketContext` (statutory bonuses,
      13th-month, severance, equity conventions), and never assume US conventions; figures from
      a pack are a *market basis*, not the user's own number (grounded / no-invent).
    - Mirrored in the Langfuse `orchestrator-system` prompt (note added in the file's setup
      comment / runbook).
    - `prompts.test.ts` asserts the new guidance string is present in the default prompt; green
      under `--selectProjects ai`.
  - **Estimate:** 0.5 day

## Phase 4 — E2E + hardening + docs

- [ ] T13 — Playwright E2E: non-US salary insights reflect the market
  - **Files:** `tests/e2e/localized-comp.spec.ts` (new)
  - **Acceptance:**
    - Seeds/uses a non-US (DE) `jobs` fixture; drives chat to request salary insights for that
      role; asserts the rendered card shows the market currency (EUR) and a statutory note —
      not raw USD assumptions.
    - Runs against `http://localhost:8443`; green under `pnpm test:e2e`.
  - **Estimate:** 1 day

- [ ] T14 — Version-independence + fixture consistency hardening
  - **Files:** `packages/ai/src/comp/pack-loader.test.ts` (extend),
    `packages/db/src/seed-comp-packs.test.ts` (extend)
  - **Acceptance:**
    - A test adds a `(DE, version 2)` active row and asserts `loadCompPack("DE")` returns v2
      while **user data rows are untouched** (packs version independently of user data, #13).
    - `resolveMarket` → `loadCompPack` → `salaryInsights` consistency asserted on a non-US
      fixture; green under `--selectProjects ai` / `db`.
  - **Estimate:** 0.5 day

- [ ] T15 — Docs + ROADMAP update + competitor-clean verification
  - **Files:** `docs/specs/19b-localized-comp/` note (e.g. `NOTES.md`) or
    `STRUCTURED_OUTPUT.md` addendum, `docs/specs/ROADMAP.md` (progress)
  - **Acceptance:**
    - Doc records the `compKnowledgePackSchema`, the two-layer (pack vs user-data) contract,
      and "how to add a market" (seed a `(market, version)` row — no deploy).
    - ROADMAP marks 19b progress.
    - `rg` over the staged change confirms **zero competitor references** (constitution
      Article 11) before commit.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
- 19b ships the loader + schema + `packages/ai/src/comp/index.ts` seam as the stable interface
  that #3 (evaluation Comp/Demand) and #15 (negotiation) import when they land; only the
  existing `salaryInsights` consumer is wired here.
