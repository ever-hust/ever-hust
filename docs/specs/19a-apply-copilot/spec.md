# Spec #19a — Apply Copilot (HITL, never auto-submit)

> Status: Draft · Owner: Hust · Effort: M (XL for assisted server-side apply) · Phase 4 · Depends on: [#3](../03-evaluation-engine/spec.md), [#10](../10-cover-letter-pipeline/spec.md), [#6](../06-guardrails/spec.md)

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
