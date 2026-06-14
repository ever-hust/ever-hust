# Spec #12 — Interview Prep + STAR Story Bank

> Status: Draft · Owner: Hust · Effort: M–L · Phase 2–3 · Depends on: [#3](../03-evaluation-engine/spec.md) (Block F → bank)

## 1. Problem & user value

Most job-search tools stop at "apply". Interview prep is where candidates actually win or lose. The
vision: **audience-segmented prep** + a persistent, reusable **STAR+Reflection story bank** grown
from each evaluation — differentiated depth few competitors offer.

## 2. Scope

**In:** per-job interview prep (likely themes, questions, talking points, segmented by audience —
recruiter / hiring-manager / panel / exec); a persistent **story bank** of 5–10 reusable
**STAR+Reflection** master stories, grown from #3's Block-F seeds; a **mock mode** (Q&A practice).

**Out:** live video/voice mock interviews (later); negotiation ([#15](../15-negotiation/spec.md)).

## 3. Design

- **Story bank:** `interview_stories` (userId, title, situation, task, action, result, reflection,
  tags). The **Reflection** is the deliberate seniority signal ("juniors describe, seniors extract
  lessons"). Seeded/grown from #3 Block F; user-editable; reused across jobs.
- **Per-job prep:** from the job + #3 evaluation, generate audience-segmented themes/questions and
  suggest which bank stories fit each. Structured artifact (#5).
- **Mock mode:** present questions, capture answers, give structured feedback (grounded, no-invent).
- Upgrades the existing `interviewPrep` tool.

## 4. Data / API

- New `interview_stories` + `interview_sessions` (per-job prep + mock results, jsonb summary). Tool
  upgrades.

## 5. Plan & tasks

1. `interview_stories` + `interview_sessions` tables.
2. Story-bank CRUD + seed-from-#3-Block-F flow.
3. Audience-segmented per-job prep (structured artifact via #5).
4. Mock mode (Q&A + structured feedback).
5. UI: story bank manager + per-job prep + mock.
6. Tests: bank CRUD, prep structure, E2E generate prep + add story.

## 6. Acceptance

- A user gets audience-segmented prep for a job and can save/reuse STAR+Reflection stories across
  jobs; prep emits a structured artifact; CI green; **zero competitor references**.
