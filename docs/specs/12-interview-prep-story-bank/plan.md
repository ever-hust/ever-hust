# Plan: 12 — Interview Prep + STAR Story Bank

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

This epic upgrades interview prep from a single context-returning tool into two
durable, user-stateful capabilities: a persistent **STAR+Reflection story bank** and
**audience-segmented per-job prep**, plus a grounded **mock mode**. All three are
identity-bound, user-stateful data — per the Partition Rule (constitution Article 6)
they live entirely in Hust, not in the Ever Jobs corpus. The only external data this
epic reads is the job row (already synced into the `jobs` table) and the user's profile;
no new Ever Jobs API surface is required.

The data model adds two tables under `packages/db/src/schema/`. `interview_stories`
holds reusable master stories (`situation`, `task`, `action`, `result`, the seniority-
signalling `reflection`, plus `tags`), scoped to `userId`. `interview_sessions` records
each generated per-job prep artifact and each mock run as a `jsonb` summary scoped to
`userId` + `jobId`. Both follow house style (identity PK, `text("user_id")` FK with
`onDelete: "cascade"`, `jsonb().$type<T>()`, `timestamp().defaultNow()`, indexes). New
tables are applied with `pnpm db:push` against the schema barrel
`packages/db/src/schema/index.ts`.

The AI surface is delivered as Vercel-AI-SDK `tool()`s under `packages/ai/src/tools/`,
each emitting a **Zod-validated structured object alongside its prose guidance**
(constitution Article 5). We keep the existing `interviewPrepTool` (upgrading it to emit
audience-segmented structured output and to suggest matching bank stories) and add three
new tools — `storyBankTool` (CRUD), `mockInterviewTool` (present questions) and
`mockFeedbackTool` (grounded feedback on captured answers). Every tool's `inputSchema`
is `.max()`-bounded, `userId` is injected server-side by the orchestrator (never an
LLM param, constitution Article 8), and the Pro-subscription gate from the existing tool
(`subscriptionStatus in ("active","past_due")`) is preserved across the new tools.

Per-job prep depends on **#3 (evaluation engine)** for its Block-F STAR seeds and #3's
structured evaluation as an input; the structured-output contract itself is the shared
**#5 (structured output)** convention this epic conforms to. Grounded/no-invent feedback
in mock mode relies on the guardrail helpers from **#6 (guardrails)** — feedback must be
grounded in the user's own answer text and the job data, never inventing experience,
employers, or numbers (constitution Article 7). Where #3 / #6 helpers are not yet wired,
the tools degrade gracefully: the story bank seeds from user-entered stories, and mock
feedback applies a conservative grounded-only prompt contract.

Human-in-the-loop (constitution Article 4) is structural here: the bank is **draft →
explicit approval**. Seed-from-#3 produces *candidate* stories the user must explicitly
accept/edit before they persist; nothing is auto-saved or sent. Mock mode never submits
anything anywhere.

The orchestrator (`packages/ai/src/agents/orchestrator.ts`) registers each new tool in
its `tools: { ... }` object (wrapping `execute` to inject `userId`), and the system
prompt (`packages/ai/src/prompts.ts` + the Langfuse `orchestrator-system` prompt)
documents the new tools and the prep/mock/bank flows. Tool results surface on the canvas
by adding `case` branches to `apps/web/hooks/use-canvas-sync.ts` and new overlay cards
under `apps/web/components/canvas/`, modelled on `salary-insights-card.tsx`.

A thin set of authenticated API routes under `apps/web/app/api/interview/` backs the
non-chat story-bank manager UI (list/create/update/delete), following the house route
pattern: `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, Zod schemas
in `apps/web/lib/api-schemas.ts`, and `apiBadRequest()` / `apiError()` responses.

Tests are written alongside each task — Jest unit tests (`*.test.ts` in the package, run
with `pnpm test -- --selectProjects ai|db`) for schema, tool structured output, the
subscription gate and the grounded-feedback contract; a Playwright spec
(`tests/e2e/interview.spec.ts`) for the generate-prep + save-story flow. CI (lint,
type-check, unit, E2E) must be green before merge on `develop` (constitution Article 10).

## 2. Phases

### Phase 1 — Data model (story bank + sessions)

- Goal: Persist reusable STAR+Reflection stories and per-job prep/mock sessions.
- Deliverables: `interview_stories` and `interview_sessions` Drizzle tables under
  `packages/db/src/schema/`, exported from `packages/db/src/schema/index.ts`; typed
  `jsonb` columns; indexes on `userId` and `(userId, jobId)`; schema pushed via
  `pnpm db:push`; a unit test asserting column/enum shape.
- Exit criteria: `pnpm db:push` applies cleanly; `pnpm test -- --selectProjects db`
  green; both tables importable from `@ever-hust/db`.

### Phase 2 — Story bank tool + seed-from-#3 flow

- Goal: Conversational CRUD over the story bank with a draft→approve seed flow from #3's
  Block-F STAR seeds.
- Deliverables: `packages/ai/src/tools/story-bank.ts` (`storyBankTool`) emitting a
  Zod-validated structured object; `seed` action that returns *candidate* stories
  (grounded in #3 Block-F output or user input) which require explicit user approval
  before a `create`; exported from `packages/ai/src/tools/index.ts`; registered in the
  orchestrator with server-injected `userId`; Pro gate preserved; unit tests for CRUD
  paths, the structured-output shape, the approval gate, and the no-invent contract.
- Exit criteria: tool registered and callable; `pnpm test -- --selectProjects ai` green;
  no auto-persist (seed never writes without an explicit approved `create`).

### Phase 3 — Audience-segmented per-job prep (structured artifact)

- Goal: Upgrade `interviewPrepTool` to emit an audience-segmented structured artifact and
  suggest which bank stories fit each audience.
- Deliverables: upgraded `packages/ai/src/tools/interview-prep.ts` returning a
  `.parse()`-validated artifact (themes/questions/talking-points segmented by
  `recruiter | hiring_manager | panel | exec`, plus `suggestedStoryIds`); reads #3's
  structured evaluation when available and degrades gracefully when absent; a written
  `interview_sessions` row of `type: "prep"`; prompt + Langfuse update documenting the new
  shape; unit tests for the artifact schema and graceful-degradation path.
- Exit criteria: prep emits a Zod-validated structured artifact; session row written;
  `pnpm test -- --selectProjects ai` green.

### Phase 4 — Mock mode (Q&A + grounded feedback)

- Goal: Present interview questions, capture the user's answers, and return grounded,
  no-invent structured feedback.
- Deliverables: `packages/ai/src/tools/mock-interview.ts` (`mockInterviewTool` presents
  questions; `mockFeedbackTool` scores a captured answer) emitting Zod-validated
  structured feedback grounded only in the answer text + job data (no fabricated
  experience/numbers, per #6); `interview_sessions` row of `type: "mock"` with a `jsonb`
  summary; exported + registered in the orchestrator with `userId` injection; Pro gate;
  unit tests for the feedback schema and the grounded/no-invent contract.
- Exit criteria: mock run persists a session summary; feedback is structured and
  grounded; `pnpm test -- --selectProjects ai` green.

### Phase 5 — Canvas + UI surfaces

- Goal: Surface prep, mock and the story bank in the right-hand canvas.
- Deliverables: `case "interviewPrep"`, `case "storyBank"`, `case "mockInterview"` /
  `case "mockFeedback"` branches in `apps/web/hooks/use-canvas-sync.ts`; overlay cards
  `apps/web/components/canvas/interview-prep-card.tsx`,
  `apps/web/components/canvas/story-bank-card.tsx`,
  `apps/web/components/canvas/mock-interview-card.tsx` (modelled on
  `salary-insights-card.tsx`, using `@ever-hust/ui/*` + `cn()`); authenticated
  story-bank CRUD routes under `apps/web/app/api/interview/` with Zod schemas in
  `apps/web/lib/api-schemas.ts`.
- Exit criteria: each tool result renders its card; story-bank manager round-trips via the
  API routes; `pnpm test -- --selectProjects web-lib` green.

### Phase 6 — E2E + docs

- Goal: Lock the critical user flow and finish prompt/docs.
- Deliverables: `tests/e2e/interview.spec.ts` covering "generate audience-segmented prep
  for a job" + "save/reuse a STAR+Reflection story"; final `packages/ai/src/prompts.ts`
  (and Langfuse `orchestrator-system`) wording for prep/mock/bank; spec `## Decisions`
  updates for resolved open questions; `docs/specs/ROADMAP.md` progress bump.
- Exit criteria: `pnpm test:e2e` green; competitor self-check clean; full CI green on
  `develop`.

## 3. Packages Touched

| Package                                                   | Change                                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/interview-stories.ts`            | **new** `interview_stories` table (STAR + reflection + tags), exported from `packages/db/src/schema/index.ts`                                              |
| `packages/db/src/schema/interview-sessions.ts`           | **new** `interview_sessions` table (per-job prep + mock results, `jsonb` summary), exported from `packages/db/src/schema/index.ts`                         |
| `packages/ai/src/tools/interview-prep.ts`                | **upgrade** existing tool → audience-segmented Zod artifact + `suggestedStoryIds` + writes a `prep` session row                                            |
| `packages/ai/src/tools/story-bank.ts`                    | **new** `storyBankTool` — CRUD + draft/seed-from-#3 (approval-gated), structured output                                                                    |
| `packages/ai/src/tools/mock-interview.ts`                | **new** `mockInterviewTool` + `mockFeedbackTool` — present questions / grounded structured feedback                                                        |
| `packages/ai/src/tools/index.ts`                         | export `storyBankTool`, `mockInterviewTool`, `mockFeedbackTool`                                                                                            |
| `packages/ai/src/agents/orchestrator.ts`                 | register new tools in `tools: { ... }` (wrap `execute` to inject `userId`); keep `stopWhen: stepCountIs(5)`                                                |
| `packages/ai/src/prompts.ts`                             | document new tools + prep/mock/bank flows (mirror into Langfuse `orchestrator-system`)                                                                     |
| `apps/web/hooks/use-canvas-sync.ts`                      | add `case "interviewPrep" \| "storyBank" \| "mockInterview" \| "mockFeedback"` to `handleToolResult`; extend `CanvasState`                                  |
| `apps/web/components/canvas/interview-prep-card.tsx`     | **new** overlay card (template: `salary-insights-card.tsx`)                                                                                                |
| `apps/web/components/canvas/story-bank-card.tsx`         | **new** story-bank manager card                                                                                                                            |
| `apps/web/components/canvas/mock-interview-card.tsx`     | **new** mock Q&A + feedback card                                                                                                                           |
| `apps/web/app/api/interview/stories/route.ts`            | **new** authenticated list/create story routes (`requireSessionUser`, `applyRateLimit(userId,"authenticated")`)                                            |
| `apps/web/app/api/interview/stories/[id]/route.ts`       | **new** authenticated update/delete story routes                                                                                                          |
| `apps/web/lib/api-schemas.ts`                            | add Zod request schemas for story CRUD                                                                                                                     |
| `packages/jobs-api`                                      | (no change) — reads existing synced `jobs` rows only; no new Ever Jobs API surface                                                                         |
| `packages/ui`                                            | (no change) — reuse `@ever-hust/ui/{card,button,badge,dialog}` + `cn()`                                                                                    |

## 4. Dependencies

| Library                | Version          | Rationale                                                                                                  |
| ---------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `drizzle-orm`          | existing (in-repo)| Schema + queries for the two new tables — already the house ORM; no new dep.                              |
| `ai` (Vercel AI SDK)   | existing v6      | `tool()` definitions for the new/upgraded tools — already in `packages/ai`; no new dep.                    |
| `zod`                  | existing         | `.max()`-bounded input schemas + `.parse()`-validated structured output (Article 5/8); no new dep.        |

No new third-party direct dependencies are introduced (constitution Article 10.5). Upstream
*epic* dependencies: **#3** (evaluation engine — Block-F STAR seeds + structured evaluation
input), **#5** (structured-output contract this epic conforms to), **#6** (grounded /
no-invent guardrail helpers for mock feedback).

## 5. Risks & Mitigations

| Risk                                                                              | Likelihood | Impact | Mitigation                                                                                                                   |
| --------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| #3 (evaluation engine / Block-F seeds) not yet landed when this epic starts       | M          | M      | Seed flow degrades to user-entered stories; per-job prep reads #3 output only when present, else falls back to job+profile. |
| #6 guardrail helpers not yet wired for mock feedback                              | M          | M      | Apply a conservative grounded-only prompt contract inline; swap to #6 helpers when available (no schema change).            |
| LLM invents experience/numbers in mock feedback (Article 7 violation)             | M          | H      | Feedback grounded strictly in the user's answer text + job data; unit test asserts no-invent contract; #6 helpers later.    |
| Auto-persisting seeded stories without approval (Article 4 violation)             | L          | H      | Seed returns *candidates* only; persistence requires an explicit approved `create`; unit test asserts no write on seed.     |
| LLM-supplied `userId` / oversized payloads                                        | L          | H      | `userId` injected server-side in the orchestrator; every input schema `.max()`-bounded (Article 8); covered by unit tests.  |
| Pro-gate regression on the new tools                                              | L          | M      | Reuse the existing `subscriptionStatus in ("active","past_due")` check; explicit gate unit test per tool.                   |
| Canvas state bloat from large prep/mock artifacts                                 | L          | L      | Trim/snapshot summaries before canvas sync; cap stored `jsonb` summary fields via Zod bounds.                               |

## 6. Rollback Plan

The feature is additive and disable-able without data loss. To disable: remove the new
tool registrations from `packages/ai/src/agents/orchestrator.ts`'s `tools: { ... }` object
and revert the prompt additions in `packages/ai/src/prompts.ts` (and the Langfuse
`orchestrator-system` prompt) — the agent stops offering bank/mock and falls back to the
prior `interviewPrep` behaviour. The new canvas `case` branches are inert when no tool
result arrives, so they can stay. The `interview_stories` and `interview_sessions` tables
are independent of existing tables (no FK incoming) and can be left in place (orphan, no
impact) or dropped manually once confirmed empty. No existing column is altered, so no
data migration is undone.

## 7. Migration Plan (if applicable)

No data migration of existing rows is required — both tables are net-new and start empty.
The only schema change is additive (two new tables via `pnpm db:push`). The existing
`interviewPrepTool` is upgraded in place: its previous callers (orchestrator + prompt) keep
working because the tool's input contract is preserved and the structured artifact is added
*alongside* the existing `context`/`instruction` fields, so older chat transcripts and the
canvas remain backward-compatible. No env vars or config change.

## 8. Open Questions for Plan

- **Bank size cap:** spec says "5–10 reusable master stories" — enforce a hard cap on
  `create` (reject/oldest-evict) or treat as soft guidance? (Default: soft guidance + a UI
  nudge; resolve before Phase 2.)
- **#3 seed coupling:** is #3's Block-F output available as a typed structured object this
  epic can import, or must we accept it as a loosely-typed `jsonb` for now? (Affects the
  seed action's input shape in Phase 2.)
- **Mock feedback model tier:** should mock feedback always use the user's resolved model,
  or pin a minimum (e.g. Sonnet) for grounded scoring quality on free-tier? (Pro-gated
  today, so likely moot — confirm in Phase 4.)
- **Tags taxonomy:** free-text tags vs a curated enum on `interview_stories.tags`?
  (Default: free-text `jsonb` string[] with `.max()` bounds; revisit if analytics needs it.)
