# Spec #19b — Localized Comp / Benefit Knowledge Packs

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: XL · Phase 4 · Depends on: [#1](../01-harvest-ever-jobs/spec.md) (non-US sync) + [#3](../03-evaluation-engine/spec.md)

## 1. Problem & user value

Comp isn't just a number — it's market **semantics** that differ per country (statutory bonuses,
severance norms, "deemed overtime", 13th-month pay, equity conventions). A globalization moat
beyond string i18n: per-market **knowledge packs** that let evaluation, salary insights, and
negotiation reason correctly outside the US.

## 2. Scope

**In:** versioned, per-market `comp_knowledge_packs` (data, not code) encoding comp/benefit
semantics; consumed by #3 (Comp/Demand), salary insights, and #15 (negotiation). **Out:** UI string
translation (separate i18n); building packs for every market at once (start with a few).

## 3. Design

- `comp_knowledge_packs` (market, version, semantics jsonb: statutory components, norms, equity
  conventions, severance, etc.). **Two-layer contract** ([#13](../13-learning-loop/spec.md)): packs
  upgrade independently of user data; user data wins on conflict.
- #3/#15/salary-insights read the pack for the job's market; fall back to a generic pack if absent.
- Requires non-US corpus from [#1](../01-harvest-ever-jobs/spec.md) (drop USA-only) to be useful.

## 4. Plan & tasks

1. `comp_knowledge_packs` table + a few seed markets (e.g. US, DE, UK, IN).
2. Pack loader (market → semantics) + generic fallback.
3. Wire into #3 Comp/Demand, salary insights, #15 negotiation.
4. Tests: pack load/fallback, evaluation uses market semantics for a non-US fixture.

## 5. Acceptance

- A non-US job is evaluated/negotiated using its market's comp semantics (not raw US assumptions);
  packs version independently of user data; CI green; **zero competitor references**.

## Implementation (shipped)

- **Pack module** — `packages/ai/src/comp/packs.ts`: the `CompPack` interface
  (`market`, `version`, `currency`, `statutoryComponents`, `norms`, `equityConvention`) and the
  `COMP_PACKS` registry seeded for **US, DE, UK, IN + a `GENERIC` fallback**.
- **Loader + fallback** — `getCompPack(market)` normalizes the input (`normalizeMarket`, with
  country-name aliases like `USA→US`, `Germany→DE`, `United Kingdom→UK`, `India→IN`) and returns
  the matching pack or `GENERIC` for unknown/empty markets. `isKnownMarket(market)` reports coverage.
- **Versioned data, not code-logic** — every pack carries `version: 1`; packs upgrade
  independently of user data (the two-layer contract from #13).
- **Wired into evaluation (#3 Comp/Demand)** — `packages/ai/src/tools/evaluate-job.ts` imports
  `getCompPack` (line 25), resolves the pack from `job.locationCountry` (`getCompPack(job.locationCountry)`,
  line 149), and injects the market's statutory components, norms, and equity convention into the
  evaluation prompt's Comp/Demand block so scoring uses local semantics instead of US assumptions
  (line 177).
- **Tests** — `packages/ai/src/comp/packs.test.ts`: known-market load by ISO code, country-name
  alias mapping, generic fallback for unknown/`null` markets, `isKnownMarket` coverage, and a
  shape check that every pack has currency/statutory components/norms.
- **Storage choice (intentional)** — packs are seeded as a versioned **code module**, not a
  `comp_knowledge_packs` DB table. The spec permits either ("data, not code"); v1 ships the
  in-code seed. The dedicated table + admin-editable rows is a **deferred** future enhancement.
- **Deferred consumers** — only the #3 evaluation Comp dimension currently reads the pack. Wiring
  into standalone **salary insights** and **#15 negotiation** is **deferred** (the shared loader
  is ready for both to adopt).
