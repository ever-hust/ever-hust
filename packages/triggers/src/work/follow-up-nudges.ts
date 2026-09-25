import { db as defaultDb, applications, jobs, users } from "@ever-hust/db";
import { sendFollowUpNudgeEmail } from "@ever-hust/email";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  computeFollowUpSuggestions,
  FOLLOWABLE_STAGES,
  OVERDUE_AFTER_DAYS,
  type FollowUpApp,
} from "@ever-hust/ai/cadence/follow-ups";
import { CronWorkError, deadlineFrom } from "./errors";
import { classifySendOutcome } from "./send-outcome";

/** Don't re-nudge the same user more often than this (days). */
export const NUDGE_COOLDOWN_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type NudgeDb = typeof defaultDb;

/** Users last nudged at or before this instant are due again. */
export function nudgeCooldownCutoff(now: Date): Date {
  return new Date(now.getTime() - NUDGE_COOLDOWN_DAYS * MS_PER_DAY);
}

// ── Kill switch ──────────────────────────────────────────────────────────────

/**
 * `FOLLOW_UP_NUDGES_ENABLED` (read in the app runtime). The nudge email has never gone out in any
 * environment, and it still lacks a settings toggle (`followUpNudges` is not in the user
 * preferences schema, so the opt-out cannot be set) and a per-application repeat cap (a nudge
 * does not touch `followUpCount` / `lastFollowUpAt`, so an application stuck in `applied` would be
 * nudged every cooldown, forever). Until those exist the digest stays OFF: only `true`, `1`,
 * `yes` or `on` enable it. Unset, empty or anything else → disabled, and the run touches nothing.
 */
export function resolveFollowUpNudgesEnabled(raw: string | undefined = process.env.FOLLOW_UP_NUDGES_ENABLED): boolean {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (normalized !== "" && !["false", "0", "no", "off"].includes(normalized)) {
    console.warn(`[follow-up-nudges] Unrecognised FOLLOW_UP_NUDGES_ENABLED="${raw}"; nudges stay disabled.`);
  }
  return false;
}

/**
 * Resend idempotency key for one user's nudge window: the user id plus the
 * `last_follow_up_nudge_at` the window started from (`first` if never nudged). The marker only
 * moves after a send was accepted, so every attempt at the same window sends the same key and
 * Resend delivers at most one email (SEND-THEN-ADVANCE; see `work/job-alerts.ts` for the full
 * reasoning and the 24 h key-window limit).
 */
export function nudgeIdempotencyKey(userId: string, previousNudgeAt: Date | null): string {
  return `follow-up-nudge/${userId}/${previousNudgeAt ? previousNudgeAt.getTime() : "first"}`;
}

/**
 * Record a sent nudge window (existing `users.last_follow_up_nudge_at` column, no schema change):
 * move the marker from `previous` (the value the send's idempotency key was derived from) to
 * `sentAt`, with `WHERE id = ? AND last_follow_up_nudge_at IS NOT DISTINCT FROM previous`. Returns
 * false (and changes nothing) when an overlapping run already advanced it. Only this module writes
 * the column, always from a JS Date, so the equality is exact.
 */
export async function advanceNudgeMarker(
  database: NudgeDb,
  userId: string,
  previous: Date | null,
  sentAt: Date,
): Promise<boolean> {
  const rows = await database
    .update(users)
    .set({ lastFollowUpNudgeAt: sentAt, updatedAt: sentAt })
    .where(
      and(
        eq(users.id, userId),
        previous === null ? isNull(users.lastFollowUpNudgeAt) : eq(users.lastFollowUpNudgeAt, previous),
      ),
    )
    .returning({ id: users.id });
  return rows.length > 0;
}

export interface FollowUpNudgeResult {
  /** Resend accepted the email and this run recorded the window (`sent` kept for back-compat). */
  sent: number;
  /**
   * Nothing new was recorded by this run: Resend reported the window's key as already used (an
   * earlier attempt delivered it), or an overlapping run recorded the window first. One email.
   */
  deduplicated: number;
  /** Users with followable applications that are outside their cooldown. */
  users: number;
  skippedOptedOut: number;
  skippedNothingDue: number;
  /** The user's marker is still inside the cooldown (defensive; the candidate query filters these). */
  skippedInCooldown: number;
  /** A request with the same key was still in flight (overlapping run); the run answers non-2xx. */
  skippedInFlight: number;
  /** The send failed, or it was accepted but the window could not be recorded. A retry resends with the same key. */
  failed: number;
  deferred: number;
}

export interface FollowUpNudgeDeps {
  db?: NudgeDb;
  sendEmail?: typeof sendFollowUpNudgeEmail;
  /** Absolute deadline (epoch ms). */
  deadline?: number;
  clock?: () => number;
}

/**
 * Follow-up nudge digest (spec #9). Finds each user's applications that are due a follow-up
 * (per the pure cadence engine + #6 caps), and emails a capped, polite digest — but only if the
 * user hasn't opted out (`preferences.followUpNudges === false`) and hasn't been nudged within the
 * cooldown. Sending is a reminder, not a follow-up: it never touches `applications.followUpCount`.
 * A single user's failure is counted (their marker untouched, so the retry resends with the same
 * key); it never stops the batch.
 * Ignores the kill switch — the route calls {@link runFollowUpNudges}, which checks it first.
 */
export async function processFollowUpNudges(
  now: Date = new Date(),
  deps: FollowUpNudgeDeps = {},
): Promise<FollowUpNudgeResult> {
  const database = deps.db ?? defaultDb;
  const send = deps.sendEmail ?? sendFollowUpNudgeEmail;
  const clock = deps.clock ?? Date.now;
  const deadline = deps.deadline ?? Number.POSITIVE_INFINITY;
  const cutoff = nudgeCooldownCutoff(now);

  // Followable applications (joined with job + owner) of users outside their cooldown — capped to
  // bound memory. The cooldown filter here is what lets a retry continue where a run stopped.
  const rows = await database
    .select({
      userId: applications.userId,
      applicationId: applications.id,
      stage: applications.pipelineStage,
      stageChangedAt: applications.stageChangedAt,
      followUpCount: applications.followUpCount,
      lastFollowUpAt: applications.lastFollowUpAt,
      jobTitle: jobs.title,
      companyName: jobs.companyName,
      userName: users.name,
      userEmail: users.email,
      preferences: users.preferences,
      lastFollowUpNudgeAt: users.lastFollowUpNudgeAt,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(users, eq(applications.userId, users.id))
    .where(
      and(
        inArray(applications.pipelineStage, [...FOLLOWABLE_STAGES]),
        or(isNull(users.lastFollowUpNudgeAt), lte(users.lastFollowUpNudgeAt, cutoff)),
      ),
    )
    .limit(20000);

  // Group rows by user.
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  const result: FollowUpNudgeResult = {
    sent: 0,
    deduplicated: 0,
    users: byUser.size,
    skippedOptedOut: 0,
    skippedNothingDue: 0,
    skippedInCooldown: 0,
    skippedInFlight: 0,
    failed: 0,
    deferred: 0,
  };

  let index = 0;
  for (const [userId, userRows] of byUser) {
    if (clock() > deadline) {
      result.deferred = byUser.size - index;
      break;
    }
    index++;
    try {
      const first = userRows[0]!;
      // Opt-out + cooldown gates (the candidate query already applies the cooldown).
      const prefs = (first.preferences ?? {}) as Record<string, unknown>;
      if (prefs.followUpNudges === false) {
        result.skippedOptedOut++;
        continue;
      }
      const previous = first.lastFollowUpNudgeAt ?? null;
      if (previous && previous.getTime() > cutoff.getTime()) {
        result.skippedInCooldown++;
        continue;
      }

      const apps: FollowUpApp[] = userRows.map((r) => ({
        applicationId: r.applicationId,
        jobTitle: r.jobTitle,
        companyName: r.companyName,
        stage: r.stage ?? "applied",
        stageChangedAt: r.stageChangedAt ?? now,
        followUpCount: r.followUpCount ?? 0,
        lastFollowUpAt: r.lastFollowUpAt ?? null,
      }));
      const due = computeFollowUpSuggestions(apps, now);
      if (due.length === 0) {
        result.skippedNothingDue++;
        continue;
      }

      // SEND, THEN ADVANCE: every attempt at this window sends the same key (Resend delivers at
      // most one email), and the marker only moves once Resend has taken the email.
      const outcome = await send({
        to: first.userEmail,
        userName: first.userName ?? "there",
        items: due.slice(0, 10).map((s) => ({
          jobTitle: s.jobTitle ?? "Your application",
          companyName: s.companyName ?? "",
          stage: s.stage,
          daysSinceActivity: s.daysSinceActivity,
          overdue: s.daysSinceActivity >= OVERDUE_AFTER_DAYS,
        })),
        idempotencyKey: nudgeIdempotencyKey(userId, previous),
      });
      const delivery = classifySendOutcome(outcome);
      if (delivery === "in_flight") {
        // Outcome unknown: never record the window on its behalf; the run answers non-2xx.
        result.skippedInFlight++;
        continue;
      }
      let advanced: boolean;
      try {
        advanced = await advanceNudgeMarker(database, userId, previous, now);
      } catch (advanceError) {
        throw new Error(
          `email accepted but the nudge could not be recorded (a retry resends it with the same idempotency key): ${
            advanceError instanceof Error ? advanceError.message : String(advanceError)
          }`,
        );
      }
      if (delivery === "accepted" && advanced) result.sent++;
      else result.deduplicated++;
    } catch (error) {
      result.failed++;
      console.error("[follow-up-nudges] failed for a user:", error instanceof Error ? error.message : error);
    }
  }

  return result;
}

export interface FollowUpNudgeRunResult extends FollowUpNudgeResult {
  /** `FOLLOW_UP_NUDGES_ENABLED` as resolved for this run. */
  enabled: boolean;
  /** Present when the kill switch is off: nothing was read or sent. */
  skipped?: "disabled";
}

/**
 * Route entry point. Does nothing (no DB query, no email) unless `FOLLOW_UP_NUDGES_ENABLED` is on
 * ({@link resolveFollowUpNudgesEnabled}); a disabled run answers 2xx with `skipped: "disabled"`.
 * When enabled, runs the digest under a time budget and throws {@link CronWorkError} (with the
 * counters) if any user failed, was deferred or was left to an overlapping run's in-flight request,
 * so the Trigger run shows FAILED and retries. The retry only sees users whose marker has not
 * moved, and resends each with the same key.
 */
export async function runFollowUpNudges(
  deps: FollowUpNudgeDeps & { now?: Date; budgetMs?: number; envEnabled?: string } = {},
): Promise<FollowUpNudgeRunResult> {
  const enabled = resolveFollowUpNudgesEnabled(deps.envEnabled ?? process.env.FOLLOW_UP_NUDGES_ENABLED);
  if (!enabled) {
    return {
      enabled: false,
      skipped: "disabled",
      sent: 0,
      deduplicated: 0,
      users: 0,
      skippedOptedOut: 0,
      skippedNothingDue: 0,
      skippedInCooldown: 0,
      skippedInFlight: 0,
      failed: 0,
      deferred: 0,
    };
  }
  const clock = deps.clock ?? Date.now;
  const result = await processFollowUpNudges(deps.now ?? new Date(clock()), {
    ...deps,
    clock,
    deadline: deps.deadline ?? deadlineFrom(clock(), deps.budgetMs),
  });
  if (result.failed > 0 || result.deferred > 0 || result.skippedInFlight > 0) {
    throw new CronWorkError(
      `Follow-up nudges incomplete: ${result.failed} failed, ${result.deferred} deferred, ${result.skippedInFlight} in flight elsewhere (sent ${result.sent}).`,
      { enabled, ...result },
    );
  }
  return { enabled, ...result };
}
