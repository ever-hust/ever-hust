# Spec #15 — Negotiation Coaching

> Status: Draft · Owner: Hust · Effort: M · Phase 3 · Depends on: [#3](../03-evaluation-engine/spec.md) + comp data ([#1](../01-harvest-ever-jobs/spec.md))

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
