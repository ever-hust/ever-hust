# Tasks: 12 — Interview Prep + STAR Story Bank

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Data model (story bank + sessions)

- [ ] T01 — `interview_stories` table
  - **Files:** `packages/db/src/schema/interview-stories.ts` (new); export from `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table `interview_stories` with house-style PK `integer("id").primaryKey().generatedAlwaysAsIdentity()`; `userId text("user_id").notNull().references(() => users.id, { onDelete: "cascade" })`.
    - Columns: `title text`, `situation text`, `task text`, `action text`, `result text`, `reflection text` (the seniority signal), `tags jsonb("tags").$type<string[]>().default([])`, `createdAt`/`updatedAt timestamp().notNull().defaultNow()`.
    - Index `interview_stories_user_id_idx` on `(userId)`.
    - Importable as `interviewStories` from `@ever-hust/db`.
  - **Estimate:** 0.5 day

- [ ] T02 — `interview_sessions` table
  - **Files:** `packages/db/src/schema/interview-sessions.ts` (new); export from `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table `interview_sessions` with identity PK; `userId` FK (`onDelete: "cascade"`); `jobId integer("job_id").references(() => jobs.id, { onDelete: "cascade" })`.
    - `type text("type", { enum: ["prep","mock"] }).notNull()`; `summary jsonb("summary").$type<...>()`; `createdAt`/`updatedAt` timestamps.
    - Indexes: `interview_sessions_user_id_idx` on `(userId)`, `interview_sessions_user_job_idx` on `(userId, jobId)`.
    - Importable as `interviewSessions` from `@ever-hust/db`.
  - **Estimate:** 0.5 day

- [ ] T03 — Schema unit test + DB push
  - **Files:** `packages/db/src/schema/interview-schema.test.ts` (new); run `pnpm db:push`
  - **Acceptance:**
    - Test asserts both tables expose expected columns + the `type` enum values `["prep","mock"]`.
    - `pnpm test -- --selectProjects db` green; `pnpm db:push` applies cleanly to the dev database with no destructive diff.
  - **Estimate:** 0.5 day

## Phase 2 — Story bank tool + seed-from-#3 flow

- [ ] T04 — `storyBankTool` (CRUD + structured output)
  - **Files:** `packages/ai/src/tools/story-bank.ts` (new)
  - **Acceptance:**
    - `tool({ description, inputSchema, execute })` with an `action` enum `["list","create","update","delete","seed"]`; all string/array inputs `.max()`-bounded; `userId` optional + injected server-side (never LLM-supplied).
    - `create`/`update`/`delete`/`list` read+write `interviewStories` scoped to `userId`; returns a Zod-`.parse()`-validated structured object alongside prose guidance (Article 5).
    - `seed` returns *candidate* STAR+Reflection stories (grounded in passed-in #3 Block-F seeds or user input) and **does NOT persist** — persistence only via a subsequent approved `create`.
    - Preserves Pro gate (`subscriptionStatus in ("active","past_due")`); no fabricated experience/employers/numbers.
  - **Estimate:** 1 day

- [ ] T05 — `storyBankTool` unit tests
  - **Files:** `packages/ai/src/tools/__tests__/story-bank.test.ts` (new)
  - **Acceptance:**
    - Tests cover each `action`; assert the structured-output schema shape; assert `seed` writes nothing (approval gate, Article 4); assert non-Pro returns `requiresUpgrade`; assert no-invent (seeded fields come only from inputs).
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

- [ ] T06 — Export + register `storyBankTool`
  - **Files:** `packages/ai/src/tools/index.ts`; `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `export { storyBankTool } from "./story-bank"` added.
    - Registered in the orchestrator `tools: { ... }` object with a wrapped `execute` injecting `userId` (pattern of `favoriteJob`/`savePreferences`); `stopWhen: stepCountIs(5)` unchanged.
    - `pnpm check-types` + `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

## Phase 3 — Audience-segmented per-job prep

- [ ] T07 — Upgrade `interviewPrepTool` to emit an audience-segmented artifact
  - **Files:** `packages/ai/src/tools/interview-prep.ts`
  - **Acceptance:**
    - Returns, **alongside** the existing `context`/`instruction`, a Zod-`.parse()`-validated `artifact` segmented by audience `recruiter | hiring_manager | panel | exec`, each with `themes`, `questions`, `talkingPoints`, plus `suggestedStoryIds` (matched from the user's `interviewStories`).
    - Reads #3's structured evaluation when present; degrades gracefully (job + profile only) when absent.
    - Existing Pro gate + input contract preserved (backward-compatible).
  - **Estimate:** 1 day

- [ ] T08 — Persist a `prep` session + prep unit tests
  - **Files:** `packages/ai/src/tools/interview-prep.ts`; `packages/ai/src/tools/__tests__/interview-prep.test.ts` (new)
  - **Acceptance:**
    - On success, writes an `interviewSessions` row `type: "prep"` (`userId`, `jobId`, `summary` jsonb).
    - Tests assert the artifact schema, the four audience segments, the graceful-degradation path (no #3 data), and that a `prep` session row is written.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

## Phase 4 — Mock mode (Q&A + grounded feedback)

- [ ] T09 — `mockInterviewTool` + `mockFeedbackTool`
  - **Files:** `packages/ai/src/tools/mock-interview.ts` (new)
  - **Acceptance:**
    - `mockInterviewTool` presents structured questions for a `jobId` (segmented by audience); `mockFeedbackTool` accepts a captured answer (`.max()`-bounded) and returns Zod-`.parse()`-validated structured feedback grounded **only** in the answer text + job data (no fabricated experience/numbers, Article 7 / #6).
    - `mockFeedbackTool` writes an `interviewSessions` row `type: "mock"` with a `jsonb` summary; Pro gate preserved; `userId` injected server-side.
    - Mock mode never submits/sends anything anywhere.
  - **Estimate:** 1 day

- [ ] T10 — Mock-mode unit tests
  - **Files:** `packages/ai/src/tools/__tests__/mock-interview.test.ts` (new)
  - **Acceptance:**
    - Tests assert question + feedback structured-output schemas; assert grounded/no-invent contract; assert a `mock` session row is written; assert non-Pro returns `requiresUpgrade`.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

- [ ] T11 — Export + register mock tools
  - **Files:** `packages/ai/src/tools/index.ts`; `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `mockInterviewTool` + `mockFeedbackTool` exported and registered in the orchestrator `tools: { ... }` with `userId`-injecting `execute` wrappers; `stopWhen: stepCountIs(5)` unchanged.
    - `pnpm check-types` + `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

## Phase 5 — Canvas + UI surfaces

- [ ] T12 — Canvas-sync cases for the new tools
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - `CanvasState` extended with `interviewPrep`, `storyBank`, `mockSession` fields (+ clear callbacks like `clearSalaryInsights`).
    - `handleToolResult` gains `case "interviewPrep"`, `case "storyBank"`, `case "mockInterview"`, `case "mockFeedback"` updating canvas state (pattern of the existing `salaryInsights` case).
    - `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T13 — Interview prep + mock overlay cards
  - **Files:** `apps/web/components/canvas/interview-prep-card.tsx` (new); `apps/web/components/canvas/mock-interview-card.tsx` (new)
  - **Acceptance:**
    - Prep card renders the four audience segments + suggested bank stories; mock card renders question → answer input → feedback; both modelled on `salary-insights-card.tsx`, using `@ever-hust/ui/{card,button,badge}` + `cn()` from `@ever-hust/ui/lib/utils`.
    - Cards are wired into the canvas render path (`apps/web/components/canvas/jobs-canvas.tsx` / dashboard canvas) and render when their state is set.
  - **Estimate:** 1 day

- [ ] T14 — Story-bank manager card + CRUD API routes
  - **Files:** `apps/web/components/canvas/story-bank-card.tsx` (new); `apps/web/app/api/interview/stories/route.ts` (new); `apps/web/app/api/interview/stories/[id]/route.ts` (new); `apps/web/lib/api-schemas.ts`
  - **Acceptance:**
    - Routes use `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, Zod request schemas from `apps/web/lib/api-schemas.ts`, and `apiBadRequest()` / `apiError()` from `apps/web/lib/api-response.ts`; all queries scoped to the session `userId`.
    - `GET`/`POST` on `/stories`, `PATCH`/`DELETE` on `/stories/[id]`; the card round-trips create/edit/delete against these routes (draft→explicit save; never auto-persists).
    - Validation rejects oversized/invalid payloads (Zod `.max()` bounds).
  - **Estimate:** 1 day

- [ ] T15 — API-route unit tests
  - **Files:** `apps/web/app/api/interview/stories/route.test.ts` (new)
  - **Acceptance:**
    - Tests assert auth required, rate-limit applied, Zod rejection on bad payloads, and `userId`-scoping (a user cannot read/edit another user's story).
    - `pnpm test -- --selectProjects web-lib` green.
  - **Estimate:** 0.5 day

## Phase 6 — Prompt, E2E + docs

- [ ] T16 — System-prompt update (local + Langfuse)
  - **Files:** `packages/ai/src/prompts.ts` (mirror into Langfuse `orchestrator-system`, label `production`)
  - **Acceptance:**
    - Tool list documents `storyBank`, `mockInterview`, `mockFeedback`; the "Interview Prep" section describes audience-segmented prep, the draft→approve story-bank flow, and grounded mock feedback (no-invent).
    - Existing `prompts.test.ts` assertions still pass; `pnpm test -- --selectProjects ai` green; zero competitor references.
  - **Estimate:** 0.5 day

- [ ] T17 — E2E: generate prep + save story
  - **Files:** `tests/e2e/interview.spec.ts` (new)
  - **Acceptance:**
    - Spec drives the chat to generate audience-segmented prep for a job (prep card renders) and to save a STAR+Reflection story (story appears in the bank manager and persists on reload).
    - Runs against `http://localhost:8443`; `pnpm test:e2e` green.
  - **Estimate:** 1 day

- [ ] T18 — Docs + competitor self-check + ROADMAP
  - **Files:** `docs/specs/12-interview-prep-story-bank/spec.md` (`## Decisions`); `docs/specs/ROADMAP.md`
  - **Acceptance:**
    - Resolved Open Questions moved to the spec's `## Decisions`; ROADMAP progress bumped for epic 12.
    - Grep of all changed files for competitor names returns empty (Article 11); full CI (lint, type-check, unit, E2E) green on `develop`.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- `userId` is injected server-side by the orchestrator — never an LLM-supplied tool param.
- Every AI artifact emits a Zod-validated object alongside prose (Article 5); story-bank
  seed and any save are **draft → explicit approval** (Article 4); mock feedback is
  grounded/no-invent (Article 7).
- Verify **zero competitor references** before every commit (constitution Article 11).
- Update `docs/specs/ROADMAP.md` progress when this epic's tasks complete.
