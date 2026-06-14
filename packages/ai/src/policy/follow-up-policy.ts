/**
 * Follow-up cadence policy (spec #6 §3) — central caps so nudging can never become spam.
 * Consumed by epic #9 (follow-up cadence). Pure; `now` is passed in for deterministic tests.
 */
export interface FollowUpPolicy {
  /** Max follow-ups per application. */
  maxFollowUps: number;
  /** Minimum days between follow-ups. */
  minIntervalDays: number;
}

export const DEFAULT_FOLLOW_UP_POLICY: FollowUpPolicy = {
  maxFollowUps: 3,
  minIntervalDays: 3,
};

export type FollowUpReason = "ok" | "max_reached" | "too_soon";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function canSendFollowUp(input: {
  sentCount: number;
  lastSentAt: Date | null;
  now: Date;
  policy?: FollowUpPolicy;
}): { allowed: boolean; reason: FollowUpReason } {
  const policy = input.policy ?? DEFAULT_FOLLOW_UP_POLICY;
  if (input.sentCount >= policy.maxFollowUps) {
    return { allowed: false, reason: "max_reached" };
  }
  if (input.lastSentAt) {
    const days = (input.now.getTime() - input.lastSentAt.getTime()) / MS_PER_DAY;
    if (days < policy.minIntervalDays) {
      return { allowed: false, reason: "too_soon" };
    }
  }
  return { allowed: true, reason: "ok" };
}
