# Tasks: 09 — Follow-up Cadence Engine

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Pure cadence core + policy

- [ ] T01 — Define cadence policy type + default config
  - **Files:** `packages/ai/src/cadence/policy.ts`
  - **Acceptance:**
    - Exports `CadencePolicy` type and `DEFAULT_CADENCE_POLICY` with `appliedFirstDays: 7`,
      `interviewThankYouDays: 1`, `coldAfterDays: 21`, and a `maxFollowUps` field.
    - `maxFollowUps` is sourced from epic #6's `followUpPolicy` when available, with a local default
      of `2` and a `// TODO: import from #6 followUpPolicy` note when #6 has not yet landed.
    - No I/O, no `Date.now()` — pure config module.
  - **Estimate:** 0.5 day

- [ ] T02 — Implement pure `computeUrgency` + queue summariser (with tests)
  - **Files:** `packages/ai/src/cadence/compute-urgency.ts`,
    `packages/ai/src/cadence/compute-urgency.test.ts`
  - **Acceptance:**
    - `computeUrgency(application, now, policy)` returns `"urgent" | "overdue" | "waiting" | "cold"
      | "done"`; `now: Date` is a required injected param (no `Date.now()` anywhere in the file).
    - Maps stage source from `pipelineStage` + `stageChangedAt` when present, falling back to
      `applications.status` / `updatedAt` / `createdAt` (documented fallback for pre-#2 rows).
    - Terminal stages (`submitted`/`rejected`/`hidden`) resolve to `done`.
    - `summariseQueue(applications, now, policy)` returns counts per urgency bucket.
    - Tests cover every stage→urgency transition and exact threshold boundaries (e.g. day 6 vs day 7
      for `appliedFirst`, day 20 vs 21 for `coldAfter`) using fixed injected clocks.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

## Phase 2 — Persistence (nudge history columns)

- [ ] T03 — Add `lastFollowUpAt` + `followUpCount` to `applications` (additive) and push
  - **Files:** `packages/db/src/schema/applications.ts`,
    `packages/db/src/schema/applications.test.ts`
  - **Acceptance:**
    - Adds `lastFollowUpAt: timestamp("last_follow_up_at")` (nullable) and
      `followUpCount: integer("follow_up_count").notNull().default(0)` — no existing column removed.
    - `packages/db/src/schema/index.ts` continues to re-export `applications` (already present).
    - `pnpm db:push` applies cleanly against a scratch DB; existing rows default `followUpCount` to 0.
    - Test asserts the two new columns exist with correct defaults; `pnpm test -- --selectProjects db`
      green.
  - **Estimate:** 0.5 day

## Phase 3 — AI tool + API route

- [ ] T04 — Implement `followUpCadenceTool` with Zod structured output (with tests)
  - **Files:** `packages/ai/src/tools/follow-up-cadence.ts`,
    `packages/ai/src/tools/follow-up-cadence.test.ts`
  - **Acceptance:**
    - `tool({ description, inputSchema, execute })`; `inputSchema` is a `z.object({...})` with
      `.max()`-bounded optional filters (e.g. `stage?` string `.max(50)`); **no `userId` in the
      input schema** (injected server-side).
    - `execute({ userId, ...filters })` queries `applications` for the user, runs `computeUrgency`,
      and returns a Zod-validated structured object `{ queue: [{ applicationId, jobTitle,
      companyName, stage, urgency, daysInStage, followUpCount }], counts, generatedAt }`.
    - Reuses the pure `computeUrgency` from Phase 1 (no duplicated time math).
    - Returns a typed `error` object (never throws) on empty/failed queries, mirroring
      `salary-insights.ts`.
    - Test asserts urgency rows + counts for a seeded set and that the result parses against its Zod
      schema; `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

- [ ] T05 — Export + register the tool in the orchestrator
  - **Files:** `packages/ai/src/tools/index.ts`, `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `export { followUpCadenceTool } from "./follow-up-cadence";` added to `tools/index.ts`.
    - `followUpCadence` added to the `tools: { ... }` object in `createOrchestratorStream`, wrapped
      to inject `userId` (pattern of `favoriteJob`/`interviewPrep`), `userId` never LLM-supplied.
    - `stopWhen: stepCountIs(5)` unchanged.
    - `orchestrator.test.ts` updated to assert the new tool is registered; `ai` tests green.
  - **Estimate:** 0.5 day

- [ ] T06 — Document the tool in the system prompt
  - **Files:** `packages/ai/src/prompts.ts`
  - **Acceptance:**
    - `DEFAULT_ORCHESTRATOR_PROMPT` lists `followUpCadence` (what it does, when to use it: "what
      should I follow up on?") and states it surfaces urgency only — it never drafts or sends a
      follow-up (human-in-the-loop).
    - Note added to keep the Langfuse `orchestrator-system` prompt in sync.
    - `prompts.test.ts` updated/green to reference the new tool string.
  - **Estimate:** 0.5 day

- [ ] T07 — Add read-only `GET /api/follow-ups` route (with tests)
  - **Files:** `apps/web/app/api/follow-ups/route.ts`, `apps/web/lib/api-schemas.ts`
  - **Acceptance:**
    - `GET` handler calls `requireSessionUser()`, then `applyRateLimit(userId, "authenticated")`.
    - Validates optional query params via a Zod schema in `api-schemas.ts`; returns the same
      structured queue object as the tool (reuses the shared query helper / `computeUrgency`).
    - Errors returned via `apiBadRequest()` / `apiError()`; 401 for unauthenticated.
    - Co-located route test (or `web-lib` schema test) asserts 200 for authed, 401 for anon, and
      schema validation; `pnpm test -- --selectProjects web-lib` green.
  - **Estimate:** 1 day

## Phase 4 — UI: badges + dashboard action queue

- [ ] T08 — Build the follow-up queue overlay card
  - **Files:** `apps/web/components/canvas/follow-up-queue-card.tsx`
  - **Acceptance:**
    - Component modelled on `salary-insights-card.tsx`; lists queued applications with a colour-coded
      `@ever-hust/ui/badge` per urgency (`urgent|overdue|waiting|cold`) using `cn()` from
      `@ever-hust/ui/lib/utils`.
    - Has a dismiss/close affordance; renders an empty state when the queue is empty.
    - No destructive action and no "send" button (drafting is out of scope; surface-only).
  - **Estimate:** 1 day

- [ ] T09 — Wire the tool result into canvas sync
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - Adds `followUpQueue` to `CanvasState`, a `case "followUpCadence"` in `handleToolResult` that
      sets it from the tool result, and a `clearFollowUpQueue()` callback (pattern of
      `salaryInsights` / `clearSalaryInsights`).
    - Returned from the hook; type imported from the new card component.
  - **Estimate:** 0.5 day

- [ ] T10 — Surface badges on Kanban + action queue on dashboard
  - **Files:** `apps/web/app/(dashboard)/applications/page.tsx`,
    `apps/web/app/(dashboard)/dashboard/page.tsx`
  - **Acceptance:**
    - Applications Kanban cards show an urgency badge sourced from `GET /api/follow-ups`.
    - Dashboard renders an "action queue" block listing `overdue` + `urgent` items with deep links to
      the relevant application.
    - `pnpm build` + `pnpm check-types` green; badges are dismissable and never trigger an outward
      action.
  - **Estimate:** 1 day

## Phase 5 — Email nudges (capped, preference-aware) + E2E

- [ ] T11 — Add the follow-up nudge email template + sender (with tests)
  - **Files:** `packages/email/src/templates/follow-up-nudge.tsx`, `packages/email/src/send.ts`,
    `packages/email/src/index.ts`, `packages/email/src/send.test.ts`
  - **Acceptance:**
    - React Email template lists the user's `overdue` applications and links back to the action
      queue (`${getAppUrl()}/applications`); includes a `manageUrl` / opt-out link to `/settings`.
    - `sendFollowUpNudgeEmail` added to `send.ts` using the existing `withRetry` + `getResend()`
      pattern; exported (template + sender) from `index.ts`.
    - Does **not** contain a drafted follow-up message body.
    - `send.test.ts` covers a successful send + retry path; `pnpm test -- --selectProjects email`
      green.
  - **Estimate:** 1 day

- [ ] T12 — Implement the `follow-up-nudges` Trigger.dev task (capped + opt-out) with tests
  - **Files:** `packages/triggers/src/follow-up-nudges.ts`, `packages/triggers/src/index.ts`,
    `packages/triggers/src/follow-up-nudges.test.ts`
  - **Acceptance:**
    - `task({ id: "follow-up-nudges" })` + `schedules.task` (daily cron, mirroring
      `daily-job-alerts` `0 8 * * *`); exported from `index.ts`.
    - Selects applications whose `computeUrgency` is `overdue`, **only** where
      `followUpCount < policy.maxFollowUps`, the user is subscribed (`active`/`past_due`), and the
      user has **not** opted out (`users.preferences` follow-up flag).
    - Sends one digest per user via `sendFollowUpNudgeEmail`, then sets `lastFollowUpAt = now` and
      increments `followUpCount` in the same guarded update (idempotent across runs).
    - Per-user `try/catch` so one failure doesn't abort the batch (pattern of `send-job-alerts.ts`).
    - Test asserts: cap is never exceeded, opted-out + non-subscribed users are skipped, and a second
      immediate run sends nothing; `pnpm test -- --selectProjects triggers` green.
  - **Estimate:** 1 day

- [ ] T13 — E2E: overdue badge appears for a seeded fixture
  - **Files:** `tests/e2e/follow-ups.spec.ts`, `tests/e2e/fixtures/` (overdue application fixture)
  - **Acceptance:**
    - Seeds an application with a stage timestamp older than `appliedFirstDays`.
    - Playwright (baseURL `http://localhost:8443`) asserts the application card / action queue shows
      an "overdue" badge.
    - Asserts no auto-send happens (no follow-up email is dispatched without explicit user action).
    - `pnpm test:e2e` green.
  - **Estimate:** 1 day

- [ ] T14 — Competitor-clean check + roadmap update + CI green
  - **Files:** `docs/specs/ROADMAP.md`
  - **Acceptance:**
    - Grep all changed files for competitor names → empty result before commit (Article 11).
    - `docs/specs/ROADMAP.md` progress updated for epic #9.
    - Full `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e` green in CI before merge to
      `develop`.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- The pure cadence layer (`packages/ai/src/cadence/`) must never call `Date.now()` — `now` is always
  injected — so urgency math stays deterministically testable.
- Human-in-the-loop: this epic only **surfaces** urgency. It never drafts a follow-up message and
  never sends or applies on the user's behalf.
- Caps + opt-out are governed by epic #6's `followUpPolicy`; never exceed the cap.
- Update `docs/specs/ROADMAP.md` progress when this epic's tasks complete.
