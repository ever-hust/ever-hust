import { canSendFollowUp, DEFAULT_FOLLOW_UP_POLICY } from "../policy/follow-up-policy";
import type { FollowUpPolicy } from "../policy/follow-up-policy";
import type { PipelineStage } from "../pipeline/stages";

/**
 * Follow-up cadence suggestions (spec #9). Pure: given the user's active applications and the
 * cadence policy (spec #6), decide which are due for a follow-up — capped so nudging never
 * becomes spam. `now` is injectable for deterministic tests.
 */

/** Stages where a follow-up makes sense (applied → interviewing). Not saved / offer / terminal. */
export const FOLLOWABLE_STAGES: readonly PipelineStage[] = [
  "applied",
  "screening",
  "interviewing",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface FollowUpApp {
  applicationId: number;
  jobTitle: string | null;
  companyName: string | null;
  stage: PipelineStage;
  stageChangedAt: Date;
  followUpCount: number;
  lastFollowUpAt: Date | null;
}

export interface FollowUpSuggestion {
  applicationId: number;
  jobTitle: string | null;
  companyName: string | null;
  stage: PipelineStage;
  daysSinceActivity: number;
  followUpCount: number;
}

export function computeFollowUpSuggestions(
  apps: FollowUpApp[],
  now: Date,
  policy: FollowUpPolicy = DEFAULT_FOLLOW_UP_POLICY,
): FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = [];

  for (const app of apps) {
    if (!FOLLOWABLE_STAGES.includes(app.stage)) continue;
    // Anchor for the interval check: last follow-up, else when the app entered this stage.
    const anchor = app.lastFollowUpAt ?? app.stageChangedAt;
    const decision = canSendFollowUp({
      sentCount: app.followUpCount,
      lastSentAt: anchor,
      now,
      policy,
    });
    if (!decision.allowed) continue;

    suggestions.push({
      applicationId: app.applicationId,
      jobTitle: app.jobTitle,
      companyName: app.companyName,
      stage: app.stage,
      daysSinceActivity: Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY),
      followUpCount: app.followUpCount,
    });
  }

  return suggestions.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
}

/**
 * Per-application follow-up urgency (spec #9 visual taxonomy). Unlike
 * {@link computeFollowUpSuggestions} (which returns only the due ones), this classifies a single
 * application so the Kanban/list UI can render a badge on every row. Pure; `now` injectable.
 *
 * - `overdue` — due AND it has been a while since the last activity.
 * - `due`     — eligible for a follow-up now.
 * - `waiting` — too soon since the last nudge (policy interval not elapsed).
 * - `capped`  — the follow-up cap has been reached; stop nudging.
 * - `none`    — the stage isn't one where a follow-up makes sense.
 */
export type FollowUpUrgency = "overdue" | "due" | "waiting" | "capped" | "none";

export interface FollowUpStatus {
  urgency: FollowUpUrgency;
  label: string;
  daysSinceActivity: number | null;
  followUpCount: number;
}

/** Days since last activity beyond which a due follow-up is considered overdue. */
export const OVERDUE_AFTER_DAYS = 7;

export function followUpUrgency(
  app: FollowUpApp,
  now: Date,
  policy: FollowUpPolicy = DEFAULT_FOLLOW_UP_POLICY,
): FollowUpStatus {
  if (!FOLLOWABLE_STAGES.includes(app.stage)) {
    return { urgency: "none", label: "", daysSinceActivity: null, followUpCount: app.followUpCount };
  }

  const anchor = app.lastFollowUpAt ?? app.stageChangedAt;
  const daysSinceActivity = Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY);
  const decision = canSendFollowUp({
    sentCount: app.followUpCount,
    lastSentAt: anchor,
    now,
    policy,
  });

  if (!decision.allowed) {
    return decision.reason === "max_reached"
      ? { urgency: "capped", label: "Follow-up limit reached", daysSinceActivity, followUpCount: app.followUpCount }
      : { urgency: "waiting", label: "Recently followed up", daysSinceActivity, followUpCount: app.followUpCount };
  }

  return daysSinceActivity >= OVERDUE_AFTER_DAYS
    ? { urgency: "overdue", label: "Follow up — overdue", daysSinceActivity, followUpCount: app.followUpCount }
    : { urgency: "due", label: "Follow up due", daysSinceActivity, followUpCount: app.followUpCount };
}
