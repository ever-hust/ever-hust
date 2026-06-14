# Spec #9 — Follow-up Cadence Engine

> Status: Draft · Owner: Hust · Effort: M · Phase 2 · Depends on: [#2](../02-applications-kanban/spec.md) (stage source), [#6](../06-guardrails/spec.md) (caps)

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
