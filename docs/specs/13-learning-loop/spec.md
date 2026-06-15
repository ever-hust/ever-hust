# Spec #13 — Personalization & Continuous-Learning Loop

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: M · Phase 2–3 · Depends on: [#3](../03-evaluation-engine/spec.md) (scores to dispute), [#5](../05-structured-output/spec.md)

## 1. Problem & user value

Retention comes from "it remembers me." When a user disputes a score, edits a generated artifact,
or marks an outcome, Hust should **learn** — tuning future scoring and generation to that user.
A two-layer data contract keeps **user data immutable** and **system content upgradeable**.

## 2. Scope

**In:** capture user **feedback/overrides** (score disputes, preferred phrasings, accepted/rejected
suggestions, outcomes) and feed them back into evaluation weighting + generation defaults; a
two-layer contract (user data wins; system packs upgrade without touching user rows).

**Out:** the writing-style fingerprint ([#14](../14-writing-style/spec.md)) — a specific consumer
of this loop; cross-user model training (out of scope; per-user only).

## 3. Design

- **`user_feedback`** (event log: kind, target ref, value, createdAt) + **`user_overrides`**
  (durable preferences: weight overrides, phrasing prefs, "always/never" rules).
- **Application:** #3 reads `user_overrides` (weights) — already in its merge order; generation
  tools read phrasing prefs; the funnel ([#8](../08-funnel-analytics/spec.md)) proposes overrides
  the user accepts.
- **Two-layer contract:** user data (`users.preferences`, overrides) is immutable to system updates;
  system content (archetype packs, knowledge packs) upgrades independently; on conflict, **user
  wins**.

## 4. Data / API

- New `user_feedback`, `user_overrides`. Read by #3 / generation tools. No removal of existing
  preference handling (extends it).

## 5. Plan & tasks

1. `user_feedback` + `user_overrides` tables.
2. Capture hooks (dispute a score, accept/reject a suggestion, edit an artifact, record outcome).
3. Wire overrides into #3 weight-merge + generation defaults.
4. Two-layer reconciliation (user-wins) + tests.
5. UI affordances (thumb/dispute on scores + artifacts).
6. Tests: override application, user-wins reconciliation, feedback capture.

## 6. Acceptance

- Disputing a score / setting a phrasing preference persists and measurably changes the next
  evaluation/generation for that user; user data is never overwritten by a system pack update; CI
  green; **zero competitor references**.

## Implementation (shipped)

The MVP shipped as the **evaluation-weight personalization slice** of the loop: the user states
what matters, it persists as their Layer-2 override, and future fit scores reflect it. The
broader feedback-event surface is deferred (see below).

- **`packages/ai/src/learning/reconcile.ts`** — pure, non-mutating two-layer merge
  (`reconcile` + `reconcileWeights`); system layer is immutable and the user layer always wins on
  key collisions, satisfying the two-layer contract (§3).
- **`packages/ai/src/learning/reconcile.test.ts`** — unit tests for user-wins precedence and
  input immutability.
- **`packages/ai/src/tools/learn-preference.ts`** — `learnPreferenceTool` (AI tool name:
  **`learnPreference`**); validates against the known evaluation dimensions and persists the
  user's weight overrides to `users.preferences.evaluationWeights`. `userId` is injected
  server-side.
- **`packages/ai/src/tools/learn-preference.test.ts`** — guard tests (unauthenticated / unknown
  dimensions) without a DB hit.
- **Persistence** — stored in the existing **`users.preferences`** JSON column
  (`evaluationWeights` key) in `packages/db/src/schema`; no new `user_feedback` / `user_overrides`
  tables were introduced (the contract was satisfied via the existing column — see deferred note).
- **Wiring into #3 (`resolveWeights`)** — `packages/ai/src/tools/evaluate-job.ts` reads
  `prefs.evaluationWeights` and passes it as the `user` layer into `resolveWeights`
  (`packages/ai/src/evaluation/scoring.ts`), whose precedence is override → user → org → default;
  so a saved preference measurably shifts the next fit score.
- **Orchestrator registration** — `packages/ai/src/agents/orchestrator.ts` exposes
  `learnPreference` (with server-side `userId` injection); also exported from
  `packages/ai/src/index.ts` and `packages/ai/src/tools/index.ts`.
- **Prompt** — `packages/ai/src/prompts.ts` documents `learnPreference` so the agent invokes it
  when the user says what matters to them.

**Deferred (intentionally, not shipped):**

- Dedicated **`user_feedback`** (event log) and **`user_overrides`** tables — folded into the
  existing `users.preferences` JSON column for the MVP; standalone tables remain a future
  enhancement once richer event capture is needed.
- General **feedback-capture hooks** beyond weights (score disputes, accept/reject suggestions,
  edit-an-artifact, record-outcome) and the **phrasing-preference** path feeding generation
  defaults — not yet wired.
- **UI affordances** (thumb / dispute control on scores and artifacts) — no dedicated component
  yet; the loop is driven through the conversational `learnPreference` tool.
