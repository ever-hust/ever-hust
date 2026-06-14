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
