# Spec #13 — Personalization & Continuous-Learning Loop

> Status: Draft · Owner: Hust · Effort: M · Phase 2–3 · Depends on: [#3](../03-evaluation-engine/spec.md) (scores to dispute), [#5](../05-structured-output/spec.md)

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
