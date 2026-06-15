# Spec #19a — Apply Copilot (HITL, never auto-submit)

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: M (XL for assisted server-side apply) · Phase 4 · Depends on: [#3](../03-evaluation-engine/spec.md), [#10](../10-cover-letter-pipeline/spec.md), [#6](../06-guardrails/spec.md)

## 1. Problem & user value

The honest, ToS-respecting form of "AI applies for you": a copilot that **drafts every field** of
an application (proposal, screening Q&A, terms) from the user's profile + the #3 evaluation +
the #10 letter — and **never auto-submits**. The user reviews and submits. This is the promised
differentiator, done ethically.

## 2. Scope

**In (standalone):** assemble a complete, review-ready application draft (all fields + answers),
present it for edit, and require an explicit **un-overridable approval** ([#6](../06-guardrails/spec.md))
before the user submits (manual copy/submit, or deep-link). **Out (this epic):** fully automated
server-side submission — that's the **optional Gauzy seam** (see below), an XL ambition.

## 3. Design

- An `applyCopilot` flow upgrades today's apply: generate proposal (from #3/#10), draft screening
  **Q&A** (from the JD + profile, no-invent), prefill terms/rate; show a 4-tab review (details /
  proposal / Q&A / terms); **`requireApproval` gate**; then manual submit or deep-link.
- **Never auto-submits.** The gate is structural; no prompt can skip it.
- **Optional Gauzy auto-apply seam (deferred, XL):** when the optional Ever Gauzy AI integration is
  enabled (see [GAUZY-INTEGRATION](../GAUZY-INTEGRATION.md) Seam A), an approved draft can be handed
  to Gauzy AI's automation to submit — still gated by explicit per-application approval. Standalone
  Hust never depends on this.

## 4. Plan & tasks

1. `applyCopilot` assembly (proposal + Q&A + terms) with `assertNoInvented`.
2. 4-tab review UI + `requireApproval` gate (reuse #6); manual submit / deep-link.
3. Persist the application (status/pipeline via #2) + structured artifact (#5).
4. (Deferred) optional Gauzy Seam-A handoff behind a flag + per-application approval.
5. Tests: gate cannot be skipped (invariant), Q&A no-invent, E2E draft→approve→record.

## 5. Acceptance

- A user gets a complete, editable application draft and must explicitly approve before any submit;
  Hust never auto-submits; the Gauzy seam is optional + flag-gated + still approval-gated; CI green;
  **zero competitor references**.

## Implementation (shipped)

- **AI tool** `applyCopilot` — `packages/ai/src/tools/apply-copilot.ts`. Assembles the full draft
  (proposal + screening Q&A + optional suggested terms) grounded in the user's real profile + the
  job row, runs the #6 no-invent audit, and opens the approval gate. NEVER submits.
- **Structured schema / artifact** — `packages/ai/src/structured/schemas/apply-draft.ts`
  (`applyDraftLlmPartSchema`, `applyDraftSummarySchema`, `applyDraftArtifact` = `apply_draft` v1,
  built on the #5 `defineArtifact` contract; carries `grounded` + `flaggedClaims`).
- **No-invent audit (#6)** — `packages/ai/src/policy/assert-no-invented.ts` (`assertNoInvented`),
  invoked over the proposal + every Q&A answer against the candidate's `allowedFacts`.
- **Approval gate (#6, structural HITL)** — `packages/ai/src/policy/require-approval.ts`
  (`createApprovalGate` / `decideApprovalGate` / `assertApproved`). The tool opens a gate under the
  reserved `applyCopilotSubmit` action in `OUTWARD_ACTION_TOOLS`; the gate is a server-side state
  transition no prompt can skip.
- **DB table** `approval_gates` — `packages/db/src/schema/approval-gates.ts` (pending →
  approved/denied/expired, 24h TTL, per-user). This epic does not add its own table; it persists the
  gate here and reuses the existing `applications` table (`packages/db/src/schema/applications.ts`).
- **Orchestrator registration** — `packages/ai/src/agents/orchestrator.ts` wires `applyCopilot`,
  injecting `userId` + `model` server-side.
- **Review UI** — the draft surfaces in the jobs canvas via the generic `ArtifactCard`
  (`apps/web/components/canvas/artifact-card.tsx`), which renders proposal / Q&A / terms as sections
  and shows a "Needs your approval — not sent" badge plus the grounded / flagged-claims indicators;
  wired through `apps/web/hooks/use-canvas-sync.ts` (the `applyCopilot` case, labelled
  "Application Draft").
- **Tests** — `packages/ai/src/tools/apply-copilot.test.ts` (auth/model guards) and the gate
  invariant in `packages/ai/src/policy/policy.test.ts` (outward actions must route through a gate).
- **Deferred (intentional):** server-side automated submission. There is no `applyCopilotSubmit`
  *implementation* — the name is reserved as a gate action only — and the **optional Ever Gauzy
  Seam-A auto-apply handoff** (plan task 4) remains unbuilt by design. Standalone Hust ends at the
  reviewed, approved draft; the user submits manually or via deep-link.
