# Spec #9 — Follow-up Cadence Engine

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: M · Phase 2 · Depends on: [#2](../02-applications-kanban/spec.md) (stage source), [#6](../06-guardrails/spec.md) (caps)

## 1. Problem & user value

Timely, polite follow-ups materially improve response rates — but seekers forget, and over-nudging
is spammy. A cadence engine computes per-application **urgency** from stage + elapsed time and
surfaces nudges (in-app badges + optional email), capped to stay tasteful.

## 2. Scope

**In:** pure urgency functions over `applications` stage/timestamps; **badges** (urgent / overdue /
waiting / cold) on the Kanban; **optional email nudges** via the existing Resend + Trigger.dev
cron; **caps** from [#6](../06-guardrails/spec.md) (e.g. max 2 follow-ups per application).

**Out:** drafting the follow-up message body (reuses the generation tooling); outreach to new
contacts ([#17](../17-outreach/spec.md)).

## 3. Design

- **Cadence policy** (config): e.g. `applied_first: 7d`, `interview_thankyou: 1d`, `max: 2`,
  cold-after: 21d. `computeUrgency(application, now) → urgent | overdue | waiting | cold | done`.
  Pure + unit-tested; `now` injected (no `Date.now()` in the pure layer).
- **Surfacing:** badges on Kanban cards + an "action queue" on the dashboard. Email nudges via a
  Trigger.dev scheduled task (reuses `send-alerts` infra) honoring caps + quiet preferences.
- **Caps + opt-out** enforced via #6's `followUpPolicy`; never exceed the cap, always user-dismissable.

## 4. Data / API

- `applications`: optional `lastFollowUpAt`, `followUpCount`. A `follow_ups` log table (optional) or
  derive from stage history. New Trigger.dev task `follow-up-nudges`.

## 5. Plan & tasks

1. Pure `computeUrgency` + cadence policy (unit-tested, `now` injected).
2. Badges + dashboard action queue (reads urgency).
3. `follow-up-nudges` Trigger.dev task (Resend), capped + preference-aware.
4. `applications.lastFollowUpAt`/`followUpCount` (migration) or follow_ups log.
5. Tests: urgency transitions, cap enforcement, E2E badge appears for an overdue fixture.

## 6. Acceptance

- An application past `applied_first` shows "overdue"; nudges respect the cap + opt-out; urgency is
  pure + unit-tested; CI green; **zero competitor references**.

## Implementation (shipped)

Shipped 2026-06-15. The cadence engine + caps + AI surfacing landed; the email/Trigger.dev nudge
task and visual Kanban badges are intentionally deferred (see "Deferred" below).

- **Pure cadence engine** — `packages/ai/src/cadence/follow-ups.ts`: `computeFollowUpSuggestions(apps, now, policy)` with `FOLLOWABLE_STAGES` (`applied`/`screening`/`interviewing`); `now` is injected (no `Date.now()` in the pure layer). Anchors on `lastFollowUpAt ?? stageChangedAt` and sorts by staleness.
- **Cap policy (from #6)** — `packages/ai/src/policy/follow-up-policy.ts`: `canSendFollowUp()` + `DEFAULT_FOLLOW_UP_POLICY` (`maxFollowUps: 3`, `minIntervalDays: 3`); reasons `ok` / `max_reached` / `too_soon`.
- **AI tool — suggestions** — `packages/ai/src/tools/follow-up-suggestions.ts` (`followUpSuggestionsTool`, registered as the `followUpSuggestions` tool): reads the signed-in user's active applications (`userId` injected server-side) and returns the ones due, capped.
- **AI tool — record** — `packages/ai/src/tools/record-follow-up.ts` (`recordFollowUpTool`, registered as `recordFollowUp`): increments `followUpCount` + sets `lastFollowUpAt` on the user's own application so future nudges respect the cap. No approval gate (sending stays manual / HITL).
- **Orchestrator wiring** — `packages/ai/src/agents/orchestrator.ts` registers both tools (with `userId` injected); exported via `packages/ai/src/index.ts` and `packages/ai/src/tools/index.ts`; documented in the system prompt (`packages/ai/src/prompts.ts`).
- **DB columns** — `packages/db/src/schema/applications.ts`: `followUpCount` (`follow_up_count`, `integer NOT NULL DEFAULT 0`) and `lastFollowUpAt` (`last_follow_up_at`, `timestamp`). Migration: `packages/db/drizzle/0001_magical_meggan.sql`.
- **Tests** — `packages/ai/src/cadence/follow-ups.test.ts` (urgency/anchor/cap/stage-skip transitions, `now` injected) and `packages/ai/src/tools/follow-up-tools.test.ts` (auth gating + `applicationId` validation).

### Shipped follow-on (visual surface)

- **Per-row follow-up badge** — `followUpUrgency(app, now, policy)` (`packages/ai/src/cadence/follow-ups.ts`, exported via the `@ever-hust/ai/cadence/follow-ups` subpath) classifies each application as `overdue` / `due` / `waiting` / `capped` / `none` (anchored on `lastFollowUpAt ?? stageChangedAt`, honouring the #6 cap). `/api/user/applications` computes it server-side per row, and `apps/web/app/(dashboard)/applications/page.tsx` renders a "Follow up" / "Due" badge for the actionable states. Unit-tested in `follow-ups.test.ts`; covered by `tests/e2e/authed/account.authed.spec.ts`.

### Shipped follow-on (email nudge)

- **`follow-up-nudges` Trigger.dev task (shipped)** — `packages/triggers/src/follow-up-nudges.ts`
  (`processFollowUpNudges`, daily 09:00 UTC) finds each user's due follow-ups (the pure cadence
  engine + #6 caps) and emails a capped, polite digest via Resend (`FollowUpNudgeEmail` template +
  `sendFollowUpNudgeEmail`). Opt-out via `preferences.followUpNudges === false`; a 3-day cooldown
  uses the new `users.last_follow_up_nudge_at` column (migration `0003`). The nudge is a reminder —
  it never increments `applications.followUpCount`. (Trigger.dev project must be deployed to schedule it.)

### Deferred (not in this ship)

- **Dashboard action queue** — the dedicated cross-application "what needs a nudge today" queue view
  is still deferred; the per-row badge + the email digest cover the taxonomy instead.
- **`follow_ups` log table** — not added; follow-up state is derived from the
  `applications.followUpCount` / `lastFollowUpAt` columns as the spec allowed.
