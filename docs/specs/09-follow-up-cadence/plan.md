# Plan: 09 — Follow-up Cadence Engine

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

The Follow-up Cadence Engine turns a candidate's pipeline timing into gentle, capped nudges:
given an application's stage and how long it has sat there, it computes a single **urgency**
verdict (`urgent | overdue | waiting | cold | done`) and surfaces that verdict as badges on the
Kanban, an action queue on the dashboard, and an optional capped email nudge. The whole feature is
read-only with respect to outward action — it never drafts or sends a follow-up message on the
user's behalf. It tells the user *which* application is due and lets them act, in line with the
human-in-the-loop constitution (Article 4): Hust surfaces; the user decides.

The design is layered so the riskiest part — the time math — is a **pure, fully unit-tested
function** with `now` injected (never `Date.now()` in the pure layer, per the spec). This pure
core, `computeUrgency(application, now, policy)`, lives in `packages/ai` next to the rate-limit /
policy helpers, has zero I/O, and is the single source of truth consumed by the UI, the API route,
and the Trigger.dev task alike. The cadence policy (per-stage thresholds, `max` follow-ups,
`coldAfter`) is a typed config object so it can be tuned without touching logic, and it reads its
cap from epic #6's shared `followUpPolicy` primitive rather than hard-coding a number.

This epic depends on two upstream epics. **#2 (Applications Kanban)** is the **stage source**: it
adds the additive `pipelineStage` (text enum, default `applied`) and `stageChangedAt` columns to
the existing `applications` table. The cadence engine reads `pipelineStage` + `stageChangedAt`
(falling back to `updatedAt`/`createdAt` when a row predates the backfill) to know *what stage* and
*how long*. **#6 (Guardrails)** owns the **caps**: the `max` follow-ups per application and the
opt-out are enforced through #6's `followUpPolicy`, so the cap is governed centrally and the nudge
task can never exceed it. Where #2's `pipelineStage` is not yet present at implementation time, the
pure function degrades gracefully by mapping the existing `userJobs.status` / `applications.status`
to a coarse stage, so this epic can land and be tested independently (standalone-first, Article 2).

Two new persisted columns on `applications` — `lastFollowUpAt` (timestamp, nullable) and
`followUpCount` (integer, default 0) — record nudge history so the cap is enforceable and idempotent
across cron runs. They are added additively via `pnpm db:push` (Article 9 / house DB style); no
column is removed. This is the only schema change; we deliberately avoid a separate `follow_ups`
log table for v1 (the spec lists it as optional) to keep the surface small, and note the trade-off
in Open Questions.

Surfacing happens in three places, all reading the same urgency verdict. (a) An AI tool,
`followUpCadenceTool`, lets the conversational agent answer "what should I follow up on?" — it
returns a Zod-validated structured object (Article 5) listing per-application urgency, and is
registered in the orchestrator with server-injected `userId` (never an LLM param). (b) The canvas
surfaces the tool result via a new `case "followUpCadence"` in `use-canvas-sync.ts` and a
`follow-up-queue-card.tsx` overlay card modelled on `salary-insights-card.tsx`. (c) A read-only API
route `GET /api/follow-ups` backs the dashboard "action queue" and badge counts without going
through the chat stream.

Email nudges reuse the existing Resend + Trigger.dev infrastructure exactly as `send-job-alerts.ts`
does: a new scheduled task `follow-up-nudges` queries applications whose urgency is `overdue`,
filters by the cap (`followUpCount < policy.max`) and subscription/opt-out preferences, sends a
single digest-style email per user via a new `sendFollowUpNudgeEmail`, and stamps `lastFollowUpAt`
/ increments `followUpCount`. The task is subscription-gated (active/past_due, mirroring the alerts
task) and never sends if the user has opted out. No message body is drafted here — the email points
the user back to the action queue (drafting is out of scope per the spec).

Testing is written alongside each unit (Article 10): the pure `computeUrgency` gets exhaustive
transition tests in `packages/ai`; the tool, API route, and cron task each get a co-located
`*.test.ts`; and a Playwright E2E asserts an "overdue" badge appears for a seeded overdue fixture.
CI (lint, type-check, unit, E2E) must be green before merge, and every file is checked for zero
competitor references before commit (Article 11).

## 2. Phases

### Phase 1 — Pure cadence core + policy

- Goal: A pure, deterministic urgency engine with an injectable `now` and a typed cadence policy
  that reads its cap from epic #6's `followUpPolicy`.
- Deliverables:
  - `packages/ai/src/cadence/policy.ts` — `CadencePolicy` type + `DEFAULT_CADENCE_POLICY`
    (`applied_first: 7d`, `interview_thankyou: 1d`, `coldAfter: 21d`, `max` from #6).
  - `packages/ai/src/cadence/compute-urgency.ts` — `computeUrgency(application, now, policy)
    → "urgent" | "overdue" | "waiting" | "cold" | "done"`, plus a `summariseQueue()` helper.
  - Co-located `compute-urgency.test.ts` covering every stage→urgency transition and boundary times.
- Exit criteria: `pnpm test -- --selectProjects ai` green; no `Date.now()` in the pure layer;
  cap value sourced from #6's policy (with a local default fallback when #6 is absent).

### Phase 2 — Persistence (nudge history columns)

- Goal: Record follow-up history on `applications` so caps are enforceable and idempotent.
- Deliverables:
  - Add `lastFollowUpAt` (timestamp, nullable) + `followUpCount` (integer, notNull, default 0) to
    `packages/db/src/schema/applications.ts` (additive; no removals); index unchanged exports in
    `packages/db/src/schema/index.ts` (already re-exports `applications`).
  - Apply with `pnpm db:push`.
  - `applications.test.ts` (in `packages/db`) asserting the new columns + defaults.
- Exit criteria: `pnpm db:push` applies cleanly against a scratch DB; `pnpm test -- --selectProjects db`
  green; existing `applications` rows default `followUpCount` to 0.

### Phase 3 — AI tool + API route (read-only surfacing data)

- Goal: Expose the urgency queue to the agent (structured output) and to the dashboard (REST).
- Deliverables:
  - `packages/ai/src/tools/follow-up-cadence.ts` — `tool({ ... })` with `.max()`-bounded Zod input,
    `execute` returning a Zod-validated structured queue object; `userId` injected by orchestrator.
  - Export from `packages/ai/src/tools/index.ts`; register `followUpCadence` in
    `packages/ai/src/agents/orchestrator.ts` `tools: { ... }` (inject `userId`).
  - Document the tool in `packages/ai/src/prompts.ts` (`DEFAULT_ORCHESTRATOR_PROMPT` + Langfuse
    `orchestrator-system`).
  - `apps/web/app/api/follow-ups/route.ts` — `GET`, `requireSessionUser()`, `applyRateLimit(userId,
    "authenticated")`, returns the same structured queue.
  - Co-located `follow-up-cadence.test.ts`; Zod request validation in `apps/web/lib/api-schemas.ts`.
- Exit criteria: tool returns a validated object; orchestrator step still capped at
  `stepCountIs(5)`; route returns 200 for an authed user, 401 otherwise; `ai` + `web-lib` unit
  tests green.

### Phase 4 — UI: badges + dashboard action queue

- Goal: Render urgency as Kanban badges and a dashboard action queue.
- Deliverables:
  - `apps/web/components/canvas/follow-up-queue-card.tsx` (overlay card modelled on
    `salary-insights-card.tsx`); reuse `@ever-hust/ui/badge` for `urgent|overdue|waiting|cold`.
  - Add `case "followUpCadence"` to `apps/web/hooks/use-canvas-sync.ts` (`handleToolResult` switch)
    + `followUpQueue` canvas state + `clearFollowUpQueue()`.
  - Badge on Kanban cards in `apps/web/app/(dashboard)/applications/page.tsx` (reads urgency from
    `/api/follow-ups`); action queue block on
    `apps/web/app/(dashboard)/dashboard/page.tsx`.
- Exit criteria: an overdue application shows an "overdue" badge; queue lists due items; build +
  type-check green; badges are dismissable (no destructive action).

### Phase 5 — Email nudges (capped, preference-aware) + E2E

- Goal: Optional capped email nudges via Trigger.dev + Resend, plus end-to-end coverage.
- Deliverables:
  - `packages/email/src/templates/follow-up-nudge.tsx` + `sendFollowUpNudgeEmail` in
    `packages/email/src/send.ts`; export both from `packages/email/src/index.ts`.
  - `packages/triggers/src/follow-up-nudges.ts` — `task` + `schedules.task` (daily cron), mirrors
    `send-job-alerts.ts`: subscription gate, cap check (`followUpCount < policy.max`), opt-out
    check, stamp `lastFollowUpAt` + increment `followUpCount`. Export from
    `packages/triggers/src/index.ts`.
  - Co-located `follow-up-nudges.test.ts` (cap + opt-out enforcement) and `send.test.ts` additions.
  - `tests/e2e/follow-ups.spec.ts` + an overdue fixture under `tests/e2e/fixtures/`.
- Exit criteria: cron never exceeds the cap, skips opted-out / non-subscribed users, is idempotent
  across runs; E2E badge test green; full `pnpm test` + `pnpm test:e2e` green.

## 3. Packages Touched

| Package                                                            | Change                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/ai`                                                      | New pure `src/cadence/{policy,compute-urgency}.ts` + tests; new tool `src/tools/follow-up-cadence.ts`; export in `src/tools/index.ts`; register in `src/agents/orchestrator.ts`; document in `src/prompts.ts`. |
| `packages/db`                                                      | Add `lastFollowUpAt` + `followUpCount` to `src/schema/applications.ts` (additive); `pnpm db:push`.       |
| `apps/web`                                                         | New `app/api/follow-ups/route.ts`; new `components/canvas/follow-up-queue-card.tsx`; `case "followUpCadence"` in `hooks/use-canvas-sync.ts`; badges in `app/(dashboard)/applications/page.tsx`; action queue in `app/(dashboard)/dashboard/page.tsx`; Zod schema in `lib/api-schemas.ts`. |
| `packages/email`                                                   | New `src/templates/follow-up-nudge.tsx`; `sendFollowUpNudgeEmail` in `src/send.ts`; exports in `src/index.ts`. |
| `packages/triggers`                                               | New `src/follow-up-nudges.ts` (task + scheduled cron); export in `src/index.ts`.                         |
| `packages/jobs-api`                                               | (no change) — cadence reads Hust-owned `applications`, not the Ever Jobs corpus.                          |
| `packages/ui`                                                      | (no new component) — reuse existing `@ever-hust/ui/badge` + `@ever-hust/ui/card`.                         |
| `tests/e2e`                                                        | New `follow-ups.spec.ts` + overdue fixture under `fixtures/`.                                            |

## 4. Dependencies

| Library                  | Version | Rationale                                                                                       |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| `ai` (Vercel AI SDK)     | v6      | Already in repo; `tool()` + Zod input schema for the new `followUpCadence` tool.                 |
| `zod`                    | (in-repo) | Structured-output contract for the tool result + API schema (Article 5).                       |
| `drizzle-orm`            | (in-repo) | Additive columns on `applications` + queue queries.                                            |
| `@trigger.dev/sdk/v3`    | (in-repo) | `task` + `schedules.task` for the `follow-up-nudges` cron, mirroring `send-job-alerts.ts`.      |
| `resend` / `@react-email/components` | (in-repo) | New nudge email template + sender, reusing the existing email infra.                  |

No new direct dependencies are introduced — every library above is already a workspace dependency.

**Upstream epic dependencies:** #5 (structured-output) — shared Zod contract the tool result and
API response conform to; #2 (applications-kanban) — `pipelineStage` + `stageChangedAt` stage source
(graceful fallback to `applications.status` / timestamps when absent); #6 (guardrails) —
`followUpPolicy` cap + opt-out primitive.

## 5. Risks & Mitigations

| Risk                                                                       | Likelihood | Impact | Mitigation                                                                                                    |
| -------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Epic #2's `pipelineStage` not merged when this lands                       | M          | M      | Pure function maps `applications.status` / `userJobs.status` to a coarse stage as a documented fallback; no hard import of #2 columns. |
| Email nudges feel spammy / over-nudge (brand risk, Article 3)              | M          | H      | Cap from #6's `followUpPolicy` (default max 2); single daily digest per user; opt-out honoured; `overdue`-only. |
| Cap double-counts across overlapping cron runs (race)                      | L          | M      | Increment `followUpCount` + set `lastFollowUpAt` in the same update guarded by `followUpCount < max`; task is idempotent and re-checks before send. |
| Pure layer accidentally reads wall-clock time                              | L          | M      | `now: Date` is a required param; unit tests inject fixed clocks; lint review forbids `Date.now()` in `src/cadence/`. |
| Resend rate-limits / transient failure                                     | L          | M      | Reuse existing `withRetry` backoff in `send.ts`; per-user try/catch so one failure doesn't abort the batch (mirrors `send-job-alerts.ts`). |
| Tool surfaces stale urgency vs. live stage changes                         | L          | L      | API route + tool compute urgency on read from current `pipelineStage`/`stageChangedAt`; no cached verdict.    |

## 6. Rollback Plan

- **Email nudges:** disable by removing/disabling the `follow-up-nudges` scheduled task in
  `packages/triggers/src/index.ts` (or de-registering its cron) — no user data is lost; the
  persisted `lastFollowUpAt` / `followUpCount` columns are inert without the task.
- **AI tool:** remove `followUpCadence` from the `tools: { ... }` object in `orchestrator.ts` and
  the export in `tools/index.ts`; the agent simply stops offering the cadence answer.
- **UI:** the badges + action queue read from `/api/follow-ups`; gate them behind a simple flag or
  remove the components — the rest of the Kanban/dashboard is unaffected.
- **Schema:** the two added columns are additive and nullable/defaulted; leaving them in place is
  harmless. No destructive migration is required to roll back behaviour.

## 7. Migration Plan (if applicable)

- `pnpm db:push` adds `lastFollowUpAt` (nullable) and `followUpCount` (default 0) to `applications`.
  Existing rows get `followUpCount = 0` and `lastFollowUpAt = NULL` automatically — they are simply
  treated as "never nudged", which is correct.
- No backfill of urgency is needed: urgency is computed on read, not stored.
- If epic #2's `pipelineStage` / `stageChangedAt` land after this epic, the pure function should be
  switched from the status-fallback path to the real stage columns — a one-line source change, no
  data migration.

## 8. Open Questions for Plan

- **Log table vs. derived history:** v1 derives nudge history from `lastFollowUpAt` /
  `followUpCount` on `applications`. Do we need a full `follow_ups` log table (per-nudge audit) for
  analytics in epic #8 (funnel analytics), or is the count sufficient? (Default: count only;
  promote to a log table if #8 needs per-event timing.)
- **Cap source of truth:** confirm the exact shape/name of #6's `followUpPolicy` export so Phase 1
  imports it rather than re-declaring `max`. Until #6 lands, Phase 1 ships a local default and a
  TODO to swap.
- **Quiet hours / per-stage opt-out:** the spec mentions "quiet preferences". Is opt-out a single
  boolean on `users.preferences`, or per-stage? (Default: single `followUpNudges` opt-out flag in
  `users.preferences`.)
- **Cron cadence:** daily at a fixed UTC hour (mirroring `daily-job-alerts` at `0 8 * * *`) vs.
  aligning to the user's timezone. (Default: daily UTC for v1.)
