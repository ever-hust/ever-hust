# Spec #17 — Recruiter / LinkedIn Outreach (draft-only)

> Status: Draft · Owner: Hust · Effort: S–M · Phase 3 · Depends on: [#16](../16-company-research/spec.md) (context)

## 1. Problem & user value

A short, well-targeted message to a recruiter/hiring manager is a network power-move. Hust drafts
concise outreach (a 3-sentence framework) grounded in the role + company research — **draft-only,
HITL**: Hust never sends or connects on the user's behalf.

## 2. Scope

**In:** generate short outreach drafts (connection note, follow-up, referral ask) using #16 company
context + the user's profile; copy-to-send. **Out:** auto-sending / auto-connecting (explicitly
not done — [#6](../06-guardrails/spec.md) HITL); managing a contacts CRM.

## 3. Design

- An `outreachDraft` tool: inputs target role/company/contact-type; outputs a short framework
  message (hook → credibility → ask), grounded + no-invent, styled by #14 if present. Structured
  artifact (#5).
- **Draft-only:** output is copy-paste; no send integration. If the optional Gauzy automation seam
  is ever enabled (see [GAUZY-INTEGRATION](../GAUZY-INTEGRATION.md)), sending still requires
  explicit per-message approval.

## 4. Plan & tasks

1. `outreachDraft` tool (frameworks; grounded; #5 artifact; #14 style).
2. UI: outreach panel on company/application; copy-to-clipboard.
3. Tests: framework structure, no-invent, copy affordance.

## 5. Acceptance

- A user gets a concise, grounded outreach draft to copy; Hust sends nothing automatically; CI
  green; **zero competitor references**.
