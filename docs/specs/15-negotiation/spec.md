# Spec #15 — Negotiation Coaching

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: M · Phase 3 · Depends on: [#3](../03-evaluation-engine/spec.md) + comp data ([#1](../01-harvest-ever-jobs/spec.md))

## 1. Problem & user value

The offer stage is high-value and high-stress, and most tools ignore it. Hust can coach: market-
anchored target ranges, **cited** scripts for counter-offers, and what to ask for beyond base.

## 2. Scope

**In:** offer-stage guidance — target range from Ever Jobs comp/market data ([#1](../01-harvest-ever-jobs/spec.md))
+ the user's level; **cited** negotiation scripts (counter, competing-offer, non-comp asks); a
checklist. **Out:** doing the negotiation for the user; legal advice.

## 3. Design

- A `negotiationCoach` tool: inputs the offer + role + user level; outputs a target range (with the
  market basis cited), scripts, and a structured artifact (#5).
- Market anchoring from #1's `/analyze` data + the #3 Comp/Demand block. Honest about uncertainty.
- HITL: drafts scripts; the user sends nothing through Hust.

## 4. Plan & tasks

1. `negotiationCoach` tool (Zod, structured artifact); market-range computation (cited).
2. Scripts library (counter / competing / non-comp), grounded + no-invent.
3. UI: offer-stage panel on the application detail (Kanban `offer` stage).
4. Tests: range math from fixture market data; structured artifact; no invented figures.

## 5. Acceptance

- At the `offer` stage a user gets a cited target range + scripts; figures trace to market data;
  CI green; **zero competitor references**.

## Implementation (shipped)

- **AI tool** — `negotiationBriefTool` in `packages/ai/src/tools/negotiation-brief.ts`, exported via
  `packages/ai/src/tools/index.ts`. Registered with the orchestrator as the `negotiationBrief` tool
  (`packages/ai/src/agents/orchestrator.ts`), with `userId` + `model` injected server-side.
- **Structured schema (#5)** — `packages/ai/src/structured/schemas/negotiation.ts` defines
  `negotiationDraftSchema` / `negotiationSummarySchema` and the `negotiationArtifact`
  (`defineArtifact("negotiation", v1)`); re-exported from `packages/ai/src/structured/index.ts`.
- **Output shape** — market-anchored `targetRange` (low/high + cited `basis`), 3–5 leverage points,
  2–3 scripts (`counter` / `competing_offer` / `non_comp_ask`), and pitfalls.
- **Grounding / no-invent (#6)** — figures are derived only from grounded salary facts (job posting
  `salaryMin`/`salaryMax`/`salaryInterval` + the user's `preferences.salaryMin/Max` + optional
  `currentOffer`); the prose is audited via `assertNoInvented` (`packages/ai/src/policy/assert-no-invented.ts`),
  setting `grounded` + `flaggedClaims`. No invented compensation numbers.
- **Data source** — reads the `jobs` and `users` tables via Drizzle (`@ever-hust/db`); no new table
  was added (the artifact is produced on demand, not persisted to its own table).
- **UI surface** — the negotiation artifact renders on the jobs canvas through the generic,
  shape-agnostic structured-artifact card `apps/web/components/canvas/artifact-card.tsx` (wired via
  `apps/web/hooks/use-canvas-sync.ts`); also exportable to PDF via
  `apps/web/lib/pdf/artifact-document.tsx`.
- **Tests** — `packages/ai/src/tools/negotiation-brief.test.ts` and
  `packages/ai/src/structured/schemas/negotiation.test.ts` (schema/range/no-invent coverage).
- **Deferred / not yet wired**: the negotiation tool anchors on the posting salary + the user's
  target directly; it does not yet consume the #3 Comp/Demand block or the #19b localized comp packs
  (`packages/ai/src/comp/packs.ts`) for market-semantics anchoring. A dedicated offer-stage panel on
  the Kanban `offer` stage (plan task 3) was not built — the brief surfaces through the shared
  canvas artifact card instead.
