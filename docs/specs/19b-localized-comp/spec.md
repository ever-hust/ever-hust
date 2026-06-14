# Spec #19b — Localized Comp / Benefit Knowledge Packs

> Status: Draft · Owner: Hust · Effort: XL · Phase 4 · Depends on: [#1](../01-harvest-ever-jobs/spec.md) (non-US sync) + [#3](../03-evaluation-engine/spec.md)

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
