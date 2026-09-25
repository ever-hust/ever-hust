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

/** Don't re-nudge the same user more often than this (days). */
export const NUDGE_COOLDOWN_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type NudgeDb = typeof defaultDb;

/** Users last nudged at or before this instant are due again. */
export function nudgeCooldownCutoff(now: Date): Date {
  return new Date(now.getTime() - NUDGE_COOLDOWN_DAYS * MS_PER_DAY);
}

/**
 * Atomically claim a user's nudge for this cooldown window (existing `users.last_follow_up_nudge_at`
 * column — no schema change). Returns false when another run already nudged (or just claimed) the
 * user, in which case the caller must NOT send. Makes Trigger retries / manual re-runs / overlapping
 * runs unable to double-send.
 */
export async function claimNudge(database: NudgeDb, userId: string, claimedAt: Date): Promise<boolean> {
  const rows = await database
    .update(users)
    .set({ lastFollowUpNudgeAt: claimedAt, updatedAt: claimedAt })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.lastFollowUpNudgeAt), lte(users.lastFollowUpNudgeAt, nudgeCooldownCutoff(claimedAt))),
      ),
    )
    .returning({ id: users.id });
  return rows.length > 0;
}

/** Undo a claim after a failed send, only if nobody has claimed the user since. */
export async function releaseNudgeClaim(
  database: NudgeDb,
  userId: string,
  previous: Date | null,
  claimedAt: Date,
): Promise<void> {
  await database
    .update(users)
    .set({ lastFollowUpNudgeAt: previous })
    .where(and(eq(users.id, userId), eq(users.lastFollowUpNudgeAt, claimedAt)));
}

export interface FollowUpNudgeResult {
  /** Emails sent (kept for back-compat with the original `{ sent }`). */
  sent: number;
  /** Users with followable applications that are outside their cooldown. */
  users: number;
  skippedOptedOut: number;
  skippedNothingDue: number;
  skippedAlreadyClaimed: number;
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
 * A single user's failure is counted (and their claim released); it never stops the batch.
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
    users: byUser.size,
    skippedOptedOut: 0,
    skippedNothingDue: 0,
    skippedAlreadyClaimed: 0,
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
      // Opt-out + cooldown gates (the cooldown is also enforced atomically by the claim below).
      const prefs = (first.preferences ?? {}) as Record<string, unknown>;
      if (prefs.followUpNudges === false) {
        result.skippedOptedOut++;
        continue;
      }
      if (first.lastFollowUpNudgeAt && first.lastFollowUpNudgeAt.getTime() > cutoff.getTime()) {
        result.skippedAlreadyClaimed++;
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

      if (!(await claimNudge(database, userId, now))) {
        result.skippedAlreadyClaimed++;
        continue;
      }
      try {
        await send({
          to: first.userEmail,
          userName: first.userName ?? "there",
          items: due.slice(0, 10).map((s) => ({
            jobTitle: s.jobTitle ?? "Your application",
            companyName: s.companyName ?? "",
            stage: s.stage,
            daysSinceActivity: s.daysSinceActivity,
            overdue: s.daysSinceActivity >= OVERDUE_AFTER_DAYS,
          })),
        });
      } catch (sendError) {
        await releaseNudgeClaim(database, userId, first.lastFollowUpNudgeAt ?? null, now).catch((err) =>
          console.error(
            "[follow-up-nudges] could not release a claim:",
            err instanceof Error ? err.message : err,
          ),
        );
        throw sendError;
      }
      result.sent++;
    } catch (error) {
      result.failed++;
      console.error("[follow-up-nudges] failed for a user:", error instanceof Error ? error.message : error);
    }
  }

  return result;
}

/**
 * Route entry point: run the digest under a time budget and throw {@link CronWorkError} (with the
 * counters) if any user failed or was deferred, so the Trigger run shows FAILED and retries — the
 * claims make that retry send only to users still due.
 */
export async function runFollowUpNudges(
  deps: FollowUpNudgeDeps & { now?: Date; budgetMs?: number } = {},
): Promise<FollowUpNudgeResult> {
  const clock = deps.clock ?? Date.now;
  const result = await processFollowUpNudges(deps.now ?? new Date(clock()), {
    ...deps,
    clock,
    deadline: deps.deadline ?? deadlineFrom(clock(), deps.budgetMs),
  });
  if (result.failed > 0 || result.deferred > 0) {
    throw new CronWorkError(
      `Follow-up nudges incomplete: ${result.failed} failed, ${result.deferred} deferred (sent ${result.sent}).`,
      result,
    );
  }
  return result;
}
