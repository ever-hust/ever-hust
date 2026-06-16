import { task, schedules } from "@trigger.dev/sdk";
import { db, applications, jobs, users } from "@ever-hust/db";
import { sendFollowUpNudgeEmail } from "@ever-hust/email";
import { and, eq, inArray } from "drizzle-orm";
import {
  computeFollowUpSuggestions,
  FOLLOWABLE_STAGES,
  OVERDUE_AFTER_DAYS,
  type FollowUpApp,
} from "@ever-hust/ai/cadence/follow-ups";

/** Don't re-nudge the same user more often than this (days). */
const NUDGE_COOLDOWN_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Follow-up nudge digest (spec #9). Finds each user's applications that are due a follow-up
 * (per the pure cadence engine + #6 caps), and emails a capped, polite digest — but only if the
 * user hasn't opted out (`preferences.followUpNudges === false`) and hasn't been nudged within the
 * cooldown. Sending is a reminder, not a follow-up: it never touches `applications.followUpCount`.
 */
export async function processFollowUpNudges(now: Date = new Date()): Promise<{ sent: number }> {
  // All followable applications joined with their job + owner (capped to bound memory).
  const rows = await db
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
    .where(inArray(applications.pipelineStage, [...FOLLOWABLE_STAGES]))
    .limit(20000);

  // Group rows by user.
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  let sent = 0;
  for (const [, userRows] of byUser) {
    try {
      const first = userRows[0]!;
      // Opt-out + cooldown gates.
      const prefs = (first.preferences ?? {}) as Record<string, unknown>;
      if (prefs.followUpNudges === false) continue;
      if (
        first.lastFollowUpNudgeAt &&
        now.getTime() - first.lastFollowUpNudgeAt.getTime() < NUDGE_COOLDOWN_DAYS * MS_PER_DAY
      ) {
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
      if (due.length === 0) continue;

      await sendFollowUpNudgeEmail({
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

      await db
        .update(users)
        .set({ lastFollowUpNudgeAt: now, updatedAt: now })
        .where(eq(users.id, first.userId));
      sent += 1;
    } catch (error) {
      console.error(
        "[follow-up-nudges] failed for a user:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { sent };
}

export const followUpNudgesTask = task({
  id: "follow-up-nudges",
  run: async () => processFollowUpNudges(),
});

// Daily at 9 AM UTC.
export const followUpNudgesSchedule = schedules.task({
  id: "daily-follow-up-nudges",
  cron: "0 9 * * *",
  run: async () => {
    await processFollowUpNudges();
  },
});
