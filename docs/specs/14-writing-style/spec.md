# Spec #14 — Writing-Style Fingerprint

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: M · Phase 3 · Depends on: [#10](../10-cover-letter-pipeline/spec.md)

## 1. Problem & user value

Generated documents read generic. If Hust learns a user's **voice**, cover letters and outreach
sound like *them* — higher trust, higher response. Done **privacy-safely**: store abstract style
**descriptors**, never raw writing samples.

## 2. Scope

**In:** derive a compact, abstract **style fingerprint** (tone, formality, sentence length,
hedging, jargon level, structure prefs) from artifacts the user approves/edits; apply it to
generation (#10, #17). **Out:** storing raw user text; cross-user style sharing.

## 3. Design

- On approve/edit of a generated artifact, extract **descriptors only** (e.g. `formality: 0.7`,
  `avgSentenceLen: short`, `usesMetrics: true`) — no raw text retained.
- Store as `users.preferences.styleFingerprint` (or a small `style_fingerprints` row); feed into
  generation prompts. Reuses the #13 learning loop.
- User can view/adjust descriptors ("more concise", "less formal").

## 4. Plan & tasks

1. Descriptor schema + extractor (from approved artifacts; no raw text).
2. Persist (preferences/table); feed into #10/#17 generation prompts.
3. UI controls to view/tune.
4. Tests: extractor outputs descriptors only; generation reflects fingerprint.

## 5. Acceptance

- After approving a few letters, generation visibly matches the user's descriptors; no raw sample
  text is stored; CI green; **zero competitor references**.

## Implementation (shipped)

Shipped a lean MVP of the privacy-safe fingerprint; the richer multi-feature design in `tasks.md`
is partly deferred (see "Deferred" below).

- **Extractor** — `packages/ai/src/style/fingerprint.ts`: `extractStyleFingerprint(samples)` returns
  the `StyleFingerprint` descriptor (`sampleCount`, `avgSentenceLength`, `avgWordLength`,
  `firstPersonRatio`, `formality`, `connectors`). Pure/deterministic TypeScript — emits **aggregate
  metrics only**, never n-grams or content tokens from the input (privacy invariant in the file
  header).
- **AI tool** — `packages/ai/src/tools/capture-writing-style.ts`: the `captureWritingStyle` tool
  (`captureWritingStyleTool`) takes user-approved samples, runs the extractor, and persists **only**
  the fingerprint — never the raw text.
- **Storage** — fingerprint is written to `users.preferences.writingStyle` (the existing `preferences`
  jsonb column, `packages/db/src/schema/users.ts`). No dedicated `style_fingerprints` table was added.
- **Orchestrator wiring** — registered in the tool set in `packages/ai/src/agents/orchestrator.ts`
  with the standard server-side `userId` injection (the LLM cannot supply `userId`); exported from
  `packages/ai/src/tools/index.ts` and `packages/ai/src/index.ts`.
- **Prompt** — `captureWritingStyle` is documented in the orchestrator capabilities list in
  `packages/ai/src/prompts.ts` (call it when the user shares writing they want future drafts to match).
- **Tests** — `packages/ai/src/style/fingerprint.test.ts` (extractor + privacy invariant) and
  `packages/ai/src/tools/capture-writing-style.test.ts` (descriptors-only persistence, no raw text).
- **Roadmap** — marked `✅ shipped` in `docs/specs/ROADMAP.md`.

**Deferred (future enhancement):** applying the fingerprint to generation prompts (#10 cover letter
/ #17 outreach) is **not yet wired** — `generate-cover-letter.ts` does not read `writingStyle`, and
no `buildStyleGuidance`/`loadWritingStyle` helpers exist. Also deferred from the original `tasks.md`
plan: the dedicated `style_fingerprints` table, the EMA merge fold, the user-facing view/tune
surfaces (settings card, canvas card, `GET`/`PATCH /api/user/writing-style` route), and the E2E spec.
The capture path and privacy-safe storage are shipped; consumption-by-generation is the next step.
