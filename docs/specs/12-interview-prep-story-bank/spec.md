# Spec #12 — Interview Prep + STAR Story Bank

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: M–L · Phase 2–3 · Depends on: [#3](../03-evaluation-engine/spec.md) (Block F → bank)

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

## Implementation (shipped)

- **Artifact schema** — `packages/ai/src/structured/schemas/interview-prep.ts`: `interviewPrepDraftSchema` (themes + `starStories` STAR bank + `questionsToAsk`) and `interviewPrepSummarySchema` (adds `jobId`, `grounded`, `flaggedClaims`); registered as the `interview_prep` artifact (`INTERVIEW_PREP_SCHEMA_VERSION = 1`) on the #5 contract via `defineArtifact`.
- **AI tool** — `packages/ai/src/tools/prep-interview.ts` exports `prepInterviewTool`: reads the job + the user's CV/skills from Postgres, calls `generateValidatedObject` to produce a STAR story bank seeded from the candidate's REAL experience, and returns the validated artifact summary.
- **No-invent grounding** — the tool audits generated STAR prose with `assertNoInvented` (`packages/ai/src/policy/assert-no-invented.ts`, spec #6), surfacing `grounded` + `flaggedClaims` so fabricated employers/projects/numbers are flagged rather than presented as fact.
- **Orchestrator wiring** — registered as the `prepInterview` tool in `packages/ai/src/agents/orchestrator.ts` (injects `userId` + `model` server-side); exported from `packages/ai/src/tools/index.ts` and described in the system prompt (`packages/ai/src/prompts.ts`).
- **Coexists with legacy tool** — the lighter coaching tool `interviewPrep` (`packages/ai/src/tools/interview-prep.ts`) is retained; `prepInterview` is the structured, grounded kit that supersedes it for persisted output.
- **Canvas / UI** — `prepInterview` results are surfaced on the jobs canvas via `apps/web/hooks/use-canvas-sync.ts` (routes the tool result to a generic artifact) rendered by the shape-agnostic `apps/web/components/canvas/artifact-card.tsx` (spec #5 surface; copy + export-to-PDF).
- **Tests** — `packages/ai/src/tools/prep-interview.test.ts` covers the auth/model guards (no DB/LLM hit).
- **Deferred (not shipped):** the persistent DB-backed **story bank** — `interview_stories` + `interview_sessions` tables, story-bank CRUD, seed-from-#3-Block-F flow, a dedicated story-bank manager UI, and **mock mode** (Q&A practice + structured feedback) — were not built. No `interview_stories`/`interview_sessions` schema exists under `packages/db/src/schema/`; the shipped STAR bank lives inside the per-job `interview_prep` artifact (regenerated per call), not as cross-job persisted, user-editable stories. Audience-segmentation is captured as prep `themes` rather than explicit recruiter/hiring-manager/panel/exec lanes.
