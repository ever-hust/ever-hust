import { db as defaultDb, escapeIlike, userAlerts, jobs, users } from "@ever-hust/db";
import { sendJobAlertEmail } from "@ever-hust/email";
import { and, eq, gte, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { CronWorkError, deadlineFrom } from "./errors";

/**
 * Job-alert emails (app-runtime work behind `POST /api/cron/job-alerts`).
 *
 * IDEMPOTENCY (no schema change — uses the existing `user_alerts.last_sent_at`):
 * an alert is sent at most once per period. Before sending, the run CLAIMS the alert with one
 * atomic conditional UPDATE (`last_sent_at = now WHERE id = ? AND (last_sent_at IS NULL OR
 * last_sent_at < now - period)`). A Trigger retry, a manual re-run or an overlapping run finds the
 * alert already claimed for this period and skips it, so nobody gets the same alert twice. If the
 * email then fails to send, the claim is released (last_sent_at restored) so the next attempt
 * retries that alert only. Tradeoff: if the process dies between claim and send, that alert is
 * skipped for one period (at-most-once, not at-least-once — a missed digest beats a duplicate).
 */

export type AlertFrequency = "daily" | "twice_daily" | "weekly";
export const ALERT_FREQUENCIES: readonly AlertFrequency[] = ["daily", "twice_daily", "weekly"];

const HOUR_MS = 60 * 60 * 1000;

/**
 * Minimum gap between two sends of the same alert. Schedules: daily 08:00 UTC; twice_daily 08:00 +
 * 18:00 UTC (gaps of 10 h and 14 h); weekly Monday 08:00 UTC. Each window is comfortably shorter
 * than the real gap and longer than any retry/re-run of the same slot.
 */
export const ALERT_MIN_INTERVAL_MS: Record<AlertFrequency, number> = {
  daily: 20 * HOUR_MS,
  twice_daily: 8 * HOUR_MS,
  weekly: 6 * 24 * HOUR_MS,
};

/** Alerts last sent before this instant are due again. */
export function alertPeriodCutoff(frequency: AlertFrequency, now: Date): Date {
  return new Date(now.getTime() - ALERT_MIN_INTERVAL_MS[frequency]);
}

type AlertDb = typeof defaultDb;

/**
 * Atomically claim an alert for this period. Returns false when another run already sent it within
 * the period (or claimed it a moment ago) — the caller must then NOT send.
 */
export async function claimAlertSend(
  database: AlertDb,
  alertId: number,
  frequency: AlertFrequency,
  claimedAt: Date,
): Promise<boolean> {
  const cutoff = alertPeriodCutoff(frequency, claimedAt);
  const rows = await database
    .update(userAlerts)
    .set({ lastSentAt: claimedAt, updatedAt: claimedAt })
    .where(
      and(
        eq(userAlerts.id, alertId),
        or(isNull(userAlerts.lastSentAt), lt(userAlerts.lastSentAt, cutoff)),
      ),
    )
    .returning({ id: userAlerts.id });
  return rows.length > 0;
}

/** Undo a claim after a failed send, only if nobody has claimed the alert since. */
export async function releaseAlertClaim(
  database: AlertDb,
  alertId: number,
  previousSentAt: Date | null,
  claimedAt: Date,
): Promise<void> {
  await database
    .update(userAlerts)
    .set({ lastSentAt: previousSentAt })
    .where(and(eq(userAlerts.id, alertId), eq(userAlerts.lastSentAt, claimedAt)));
}

export interface AlertRunResult {
  frequency: AlertFrequency;
  /** Active alerts of this frequency not yet sent in the current period. */
  candidates: number;
  sent: number;
  skippedNotEligible: number;
  skippedNoCriteria: number;
  skippedNoMatches: number;
  /** Another run claimed the alert first (retry / overlap) — not a failure. */
  skippedAlreadyClaimed: number;
  failed: number;
  /** Not processed because the run hit its time budget; a retry continues with them. */
  deferred: number;
}

export interface JobAlertDeps {
  db?: AlertDb;
  sendEmail?: typeof sendJobAlertEmail;
  now?: () => Date;
  /** Absolute deadline (epoch ms). */
  deadline?: number;
}

/** Format a salary range (numeric columns come back as strings). */
export function formatSalary(
  min: string | null,
  max: string | null,
  currency: string | null,
): string | undefined {
  if (!min && !max) return undefined;
  const c = currency ?? "USD";
  const minNum = min ? Number(min) : null;
  const maxNum = max ? Number(max) : null;
  // Guard against NaN from malformed DB values
  const safeMin = minNum !== null && Number.isFinite(minNum) ? minNum : null;
  const safeMax = maxNum !== null && Number.isFinite(maxNum) ? maxNum : null;
  if (!safeMin && !safeMax) return undefined;
  if (safeMin && safeMax) return `${c} ${safeMin.toLocaleString()}-${safeMax.toLocaleString()}`;
  if (safeMin) return `${c} ${safeMin.toLocaleString()}+`;
  if (safeMax) return `Up to ${c} ${safeMax.toLocaleString()}`;
  return undefined;
}

/** Only keep http(s) job links in emails. */
function safeJobUrl(jobUrl: string | null): string {
  if (!jobUrl) return "#";
  try {
    const parsed = new URL(jobUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? jobUrl : "#";
  } catch {
    return "#";
  }
}

/**
 * Send one frequency's due alerts. Never throws for a single alert's failure — it is counted in
 * `failed` (and its claim released) while the rest of the batch continues.
 */
export async function processAlerts(
  frequency: AlertFrequency,
  deps: JobAlertDeps = {},
): Promise<AlertRunResult> {
  const database = deps.db ?? defaultDb;
  const send = deps.sendEmail ?? sendJobAlertEmail;
  const clock = deps.now ?? (() => new Date());
  const deadline = deps.deadline ?? Number.POSITIVE_INFINITY;
  const result: AlertRunResult = {
    frequency,
    candidates: 0,
    sent: 0,
    skippedNotEligible: 0,
    skippedNoCriteria: 0,
    skippedNoMatches: 0,
    skippedAlreadyClaimed: 0,
    failed: 0,
    deferred: 0,
  };

  // Active alerts of this frequency that have not been sent in the current period (capped to
  // prevent OOM). Filtering on the period here is what lets a retry pick up where a run stopped.
  const alerts = await database
    .select()
    .from(userAlerts)
    .where(
      and(
        eq(userAlerts.frequency, frequency),
        eq(userAlerts.isActive, true),
        or(isNull(userAlerts.lastSentAt), lt(userAlerts.lastSentAt, alertPeriodCutoff(frequency, clock()))),
      ),
    )
    .limit(5000);
  result.candidates = alerts.length;

  for (let i = 0; i < alerts.length; i++) {
    if (clock().getTime() > deadline) {
      result.deferred = alerts.length - i;
      break;
    }
    const alert = alerts[i]!;
    try {
      const userResult = await database
        .select({ name: users.name, subscriptionStatus: users.subscriptionStatus })
        .from(users)
        .where(eq(users.id, alert.userId))
        .limit(1);
      const user = userResult[0];
      // Only send to active subscribers (past_due retains access during grace period)
      if (!user || (user.subscriptionStatus !== "active" && user.subscriptionStatus !== "past_due")) {
        result.skippedNotEligible++;
        continue;
      }

      const criteria = alert.criteria;
      // Skip alerts with no meaningful criteria — otherwise every recent job matches
      const hasAnyCriteria =
        (criteria?.keywords && criteria.keywords.length > 0) ||
        (criteria?.locations && criteria.locations.length > 0) ||
        (criteria?.skills && criteria.skills.length > 0) ||
        criteria?.remoteType === "remote";
      if (!hasAnyCriteria) {
        result.skippedNoCriteria++;
        continue;
      }

      const conditions = [];
      // Time filter: jobs posted since last alert
      const since = alert.lastSentAt ?? new Date(clock().getTime() - 24 * HOUR_MS);
      conditions.push(gte(jobs.createdAt, since));

      if (criteria?.keywords && criteria.keywords.length > 0) {
        const kwOr = or(
          ...criteria.keywords.map((kw) =>
            or(ilike(jobs.title, `%${escapeIlike(kw)}%`), ilike(jobs.description, `%${escapeIlike(kw)}%`)),
          ),
        );
        if (kwOr) conditions.push(kwOr);
      }
      if (criteria?.locations && criteria.locations.length > 0) {
        const locOr = or(
          ...criteria.locations.map((loc) =>
            or(
              ilike(jobs.locationCity, `%${escapeIlike(loc)}%`),
              ilike(jobs.locationState, `%${escapeIlike(loc)}%`),
              ilike(jobs.locationCountry, `%${escapeIlike(loc)}%`),
            ),
          ),
        );
        if (locOr) conditions.push(locOr);
      }
      if (criteria?.remoteType === "remote") {
        conditions.push(eq(jobs.isRemote, true));
      }
      // Skills matching (GIN index on JSONB)
      if (criteria?.skills && criteria.skills.length > 0) {
        conditions.push(
          sql`${jobs.skills} ?| array[${sql.join(
            criteria.skills.map((s) => sql`${s}`),
            sql`, `,
          )}]`,
        );
      }

      const matchingJobs = await database
        .select({
          title: jobs.title,
          companyName: jobs.companyName,
          locationCity: jobs.locationCity,
          isRemote: jobs.isRemote,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryCurrency: jobs.salaryCurrency,
          jobUrl: jobs.jobUrl,
        })
        .from(jobs)
        .where(and(...conditions))
        .limit(20);
      if (matchingJobs.length === 0) {
        result.skippedNoMatches++;
        continue;
      }

      const criteriaDesc =
        [...(criteria?.keywords ?? []), ...(criteria?.locations ?? []), criteria?.remoteType === "remote" ? "Remote" : null]
          .filter(Boolean)
          .join(", ") || "Your job preferences";

      // Claim BEFORE sending: whoever wins the conditional update is the only sender this period.
      const claimedAt = clock();
      if (!(await claimAlertSend(database, alert.id, frequency, claimedAt))) {
        result.skippedAlreadyClaimed++;
        continue;
      }
      try {
        await send({
          to: alert.email,
          userName: user.name ?? "Job Seeker",
          alertCriteria: criteriaDesc,
          jobs: matchingJobs.map((j) => ({
            title: j.title,
            companyName: j.companyName ?? "Unknown Company",
            location: j.locationCity ?? undefined,
            isRemote: j.isRemote ?? undefined,
            salary: formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency),
            jobUrl: safeJobUrl(j.jobUrl),
          })),
        });
      } catch (sendError) {
        await releaseAlertClaim(database, alert.id, alert.lastSentAt ?? null, claimedAt).catch((err) =>
          console.error(
            `[job-alerts] could not release claim on alert ${alert.id}:`,
            err instanceof Error ? err.message : err,
          ),
        );
        throw sendError;
      }
      result.sent++;
    } catch (error) {
      result.failed++;
      console.error(`[job-alerts] alert ${alert.id} failed:`, error instanceof Error ? error.message : error);
    }
  }

  return result;
}

export interface JobAlertsRunResult {
  runs: AlertRunResult[];
  sent: number;
  failed: number;
  deferred: number;
}

/**
 * Run the given frequencies in order under one time budget. Throws {@link CronWorkError} (with
 * all counters) when any alert failed or was deferred, so the route answers non-2xx and the
 * Trigger run shows FAILED and retries — the claims make that retry send only what is still due.
 */
export async function runJobAlerts(
  frequencies: readonly AlertFrequency[],
  deps: JobAlertDeps & { budgetMs?: number } = {},
): Promise<JobAlertsRunResult> {
  const clock = deps.now ?? (() => new Date());
  const deadline = deps.deadline ?? deadlineFrom(clock().getTime(), deps.budgetMs);
  const runs: AlertRunResult[] = [];
  for (const frequency of new Set(frequencies)) {
    runs.push(await processAlerts(frequency, { ...deps, now: clock, deadline }));
  }
  const total = {
    runs,
    sent: runs.reduce((n, r) => n + r.sent, 0),
    failed: runs.reduce((n, r) => n + r.failed, 0),
    deferred: runs.reduce((n, r) => n + r.deferred, 0),
  };
  if (total.failed > 0 || total.deferred > 0) {
    throw new CronWorkError(
      `Job alerts incomplete: ${total.failed} failed, ${total.deferred} deferred (sent ${total.sent}).`,
      total,
    );
  }
  return total;
}
