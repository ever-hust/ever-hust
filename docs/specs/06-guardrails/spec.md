# Spec #6 — Ethical Guardrails as Policy

> Status: Draft · Owner: Hust · Effort: S · Phase 1 · Depends on: —

## 1. Problem & user value

Hust's brand promises **quality over quantity** and **human-in-the-loop** — "we never apply on
your behalf without your sign-off; we never invent facts; we say *no* to bad-fit roles." Those
promises must be **enforced structurally** (server-side state + policy), not merely hoped for in a
prompt that any jailbreak could override. This epic encodes the guardrails once so every AI feature
inherits them.

## 2. Scope

**In:** (a) un-overridable **human approval gates** on any outward action (apply, send, outreach);
(b) **no-invent** discipline for generated artifacts; (c) **follow-up caps**; (d) **cost caps** /
score-floor gating hooks; (e) the matching **ToS** language.

**Out:** the features themselves — this provides the shared policy primitives they call.

## 3. Design

- **Approval gate (structural).** Any tool that performs an outward action transitions through a
  server-side state that requires an explicit user confirmation step. The gate is a **state
  transition**, so no prompt instruction can skip it (the existing `applyJob` HITL `needsApproval`
  pattern, generalized into a reusable `requireApproval(actionId)` primitive). **Never auto-submit.**
- **No-invent.** Generation tools must ground claims in the user's real data (CV, preferences) and
  mark anything unverifiable as a gap, not a fact. Enforced via prompt + a light post-generation
  validator (e.g. CV-evidence claims must reference real CV fields).
- **Follow-up caps.** Central cadence policy (e.g. `max` follow-ups per application) that
  [#9](../09-follow-up-cadence/spec.md) reads — prevents spammy nudging.
- **Cost caps.** A shared score-floor / quota helper (per-tier limits already exist via Upstash) so
  expensive generation (PDF, batch) only runs above a fit threshold; consumed by
  [#19](../19-batch-evaluation/spec.md) and the document epics.
- **ToS.** Encode the posture in the Terms (no auto-submit, AI-advisory, user-owns-data) so policy
  and product agree.

## 4. Data / API

- New `packages/utils` (or `packages/ai`) policy module: `requireApproval`, `withCostGate`,
  `followUpPolicy`, `assertNoInvented`. No table removals; reuse the existing rate-limit + approval
  plumbing.
- Terms page copy update (marketing) — emails/contacts already on `ever.co` per brand rules.

## 5. Plan & tasks

1. Extract the existing `applyJob` approval mechanism into a reusable `requireApproval(actionId)`
   server-side gate; document the "never auto-submit" invariant + an invariant test.
2. Add `withCostGate(scoreFloor|quota)` wrapper for expensive tools.
3. Add `followUpPolicy` (caps) consumed by #9.
4. Add `assertNoInvented` validator hook for generation artifacts (#10/#11/#12).
5. Update ToS copy; add a unit test asserting outward-action tools route through `requireApproval`.

## 6. Acceptance

- Any outward-action tool cannot complete without the approval state transition (invariant test
  passes; prompt-injection can't bypass it).
- Cost-gate + follow-up-cap helpers exist and are unit-tested.
- ToS reflects the HITL / no-auto-submit / advisory posture.
- CI green; **zero competitor references** (per workspace `RULES.md`).
