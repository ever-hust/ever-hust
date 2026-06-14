# Spec #14 — Writing-Style Fingerprint

> Status: Draft · Owner: Hust · Effort: M · Phase 3 · Depends on: [#10](../10-cover-letter-pipeline/spec.md)

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
