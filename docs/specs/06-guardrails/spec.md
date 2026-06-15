# Spec #6 — Ethical Guardrails as Policy

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: S · Phase 1 · Depends on: —

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

## Implementation (shipped)

The shared policy primitives live in a dedicated `packages/ai/src/policy/` module, re-exported from
`@ever-hust/ai`, with the human-approval gate persisted server-side and surfaced through an API
route + chat UI.

- **Policy module** — `packages/ai/src/policy/` (barrel `index.ts`, re-exported from
  `packages/ai/src/index.ts`).
- **Structural approval gate** — `packages/ai/src/policy/require-approval.ts`: the
  `OUTWARD_ACTION_TOOLS` registry (`applyJob`, `submitAnswers`, `sendOutreach`,
  `applyCopilotSubmit`) plus `createApprovalGate` / `decideApprovalGate` / `assertApproved`. Approval
  is a DB state transition (`pending → approved/denied/expired`), so no prompt can skip it; gates
  auto-expire via `APPROVAL_TTL_MS` (24h).
- **DB table** — `approval_gates` (`packages/db/src/schema/approval-gates.ts`, registered in
  `schema/index.ts`): durable, auditable, indexed by user, user+status, and action.
- **API route** — `POST apps/web/app/api/approvals/route.ts`: authenticated, rate-limited, Zod-validated;
  records the human approve/deny decision an outward-action tool waits on.
- **Approval UI** — `apps/web/components/chat/tool-approval.tsx` (`ToolApproval`): in-chat Approve/Deny
  card; outward actions never auto-submit.
- **No-invent validator** — `packages/ai/src/policy/assert-no-invented.ts` (`assertNoInvented`):
  advisory grounding check that flags proper nouns / years / numbers not traceable to the supplied
  `allowedFacts`. Non-throwing — composes with epic #5's structured summary.
- **Cost gate** — `packages/ai/src/policy/cost-gate.ts` (`evaluateCostGate` + `withCostGate`):
  score-floor / quota gating for expensive generation; consumed by #19 (batch) and the document epics.
- **Follow-up caps** — `packages/ai/src/policy/follow-up-policy.ts` (`canSendFollowUp`,
  `DEFAULT_FOLLOW_UP_POLICY` = 3 max / 3-day min); consumed by #9.
- **Per-tier limits** — `packages/ai/src/policy/limits.ts`: re-exports `FREE_LIMITS` from
  `@ever-hust/stripe` and adds eval/batch caps + `DEFAULT_SCORE_FLOOR`.
- **ToS copy** — `apps/web/app/(marketing)/terms/page.tsx`: encodes the HITL / no-auto-submit /
  advisory posture ("it never … takes action on your behalf without your explicit, per-action
  approval … enforced structurally and cannot be skipped").
- **Tests** — `packages/ai/src/policy/policy.test.ts` covers no-invent, cost-gate, follow-up caps,
  and the `OUTWARD_ACTION_TOOLS` invariant.

**No-invent enforcement (opt-in, shipped):** the advisory `assertNoInvented` remains the default
(flags claims; never blocks), but `packages/ai/src/policy/assert-no-invented.ts` now also exposes an
opt-in enforcement layer — `NoInventPolicy` (`mode: advisory|enforce`, `maxFlaggedClaims` tolerance),
`evaluateNoInvent()` (returns `{ allowed, reason, flaggedClaims }`), and `assertGrounded()` (throws
`NoInventError` in enforce mode). Default policy is advisory, so existing callers are unchanged; a
flow can now hard-gate ungrounded prose when it chooses. Tested in `policy.test.ts`.

**Deferred / partial:** wiring `assertApproved` into each outward-action tool's side-effecting path
and consuming `withCostGate` / `canSendFollowUp` are owned by their respective feature epics (#9,
#10/#11/#12, #19) — this epic ships the reusable primitives those epics call.
