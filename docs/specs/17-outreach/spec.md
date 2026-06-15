# Spec #17 — Recruiter / LinkedIn Outreach (draft-only)

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: S–M · Phase 3 · Depends on: [#16](../16-company-research/spec.md) (context)

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

## Implementation (shipped)

- **AI tool** `draftOutreach` — `packages/ai/src/tools/draft-outreach.ts`. Inputs `{ jobId, contactType: recruiter | hiring_manager | referral }`; loads the real job (`jobs`) + the user's real profile/CV (`users`) and emits a 3-sentence framework (hook → credibility → ask). **Draft-only:** returns a copy-paste message with the note "Hust never sends or connects on your behalf" — there is no send/connect path.
- **Structured schema + artifact** — `packages/ai/src/structured/schemas/outreach.ts`: `outreachDraftSchema` (the LLM-produced prose) and `outreachSummarySchema` / `outreachArtifact` built on the #5 structured-output contract (`packages/ai/src/structured/contract.ts`), versioned via `OUTREACH_SCHEMA_VERSION`.
- **No-invent audit (#6)** — the drafted message is checked with `assertNoInvented` (`packages/ai/src/policy/assert-no-invented.ts`) against the user's grounded facts (name, headline, CV summary, skills, experience, role/company); ungrounded claims surface in `flaggedClaims` rather than being presented as fact.
- **Tool export / registration** — exported from `packages/ai/src/tools/index.ts` and wired into the orchestrator as the `draftOutreach` tool (`packages/ai/src/agents/orchestrator.ts`), with `userId` + `model` injected server-side.
- **Canvas UI** — rendered on the jobs canvas via the generic structured-artifact surface: `apps/web/components/canvas/artifact-card.tsx` (shape-agnostic artifact card) and routed/labeled "Outreach Draft" in `apps/web/hooks/use-canvas-sync.ts`. Copy-to-send is the artifact card's copy affordance; no dedicated outreach panel component was built (the generic card covers it).
- **Tests** — `packages/ai/src/tools/draft-outreach.test.ts` (tool behavior, draft-only, no-invent) and `packages/ai/src/structured/schemas/outreach.test.ts` (schema/artifact).
- **Deferred (intentional):** auto-send / auto-connect remains out of scope per #6 HITL. The optional Gauzy automation seam (`docs/GAUZY-INTEGRATION.md`) is not wired here; if ever enabled, sending would still require explicit per-message approval. No contacts CRM was built (out of scope).
