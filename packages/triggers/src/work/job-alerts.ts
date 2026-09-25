import { db as defaultDb, escapeIlike, userAlerts, jobs, users, JOBS_INSERT_MAX_LATENCY_MS } from "@ever-hust/db";
import { sendJobAlertEmail } from "@ever-hust/email";
import { and, desc, eq, gt, ilike, isNull, lt, lte, or, sql } from "drizzle-orm";
import { resolveAlertWindowEnd } from "./alert-window";
import { CronWorkError, deadlineFrom } from "./errors";
import { classifySendOutcome } from "./send-outcome";

/**
 * Job-alert emails (app-runtime work behind `POST /api/cron/job-alerts`).
 *
 * WINDOWS. Each run has one fixed window end, `windowEnd`: the Trigger schedule's fire time
 * (`payload.timestamp`), or the creation time of an on-demand run (`ctx.run.createdAt`), or the
 * app's clock for a direct call ({@link resolveAlertWindowEnd}). Every attempt of one run sends the
 * same value. For each alert, one run covers the period (`previous`, `windowEnd`], where `previous`
 * is the alert's marker, the existing `user_alerts.last_sent_at` (no schema change). The marker
 * always holds the end of the last period that went out, so consecutive periods meet exactly. The
 * digest lists the jobs created in that period shifted back by {@link ALERT_JOBS_SETTLE_MS}
 * ({@link alertJobsWindow}), so that period's jobs have all committed when the run reads them
 * (guaranteed by the jobs-writer rule, see {@link ALERT_JOBS_SETTLE_MS}).
 *
 * DELIVERY: at least once, with provider-side dedupe. Per alert, SEND-THEN-ADVANCE:
 *  1. The candidate query only returns alerts not yet sent for this window end
 *     ({@link alertPeriodCutoff}), together with their marker (`previous`).
 *  2. The digest lists the matching jobs of the period ({@link alertJobsWindow}), in a fixed order,
 *     and is sent with the Resend idempotency key `job-alert/<alertId>/<previous ms|first>/<windowEnd
 *     ms>` ({@link jobAlertIdempotencyKey}).
 *  3. Only after Resend accepted it (or reported the key as already used) does the marker move to
 *     exactly `windowEnd`, with a conditional `UPDATE ... WHERE id = ? AND last_sent_at IS NOT
 *     DISTINCT FROM previous` ({@link advanceAlertMarker}). If an overlapping run already moved it,
 *     the update changes nothing.
 * Consequences:
 *  - Every attempt of one run computes the same period, the same key and the same email. A retry
 *    after a failed send, a lost response or a crash between the send and the advance repeats the
 *    first request exactly, and Resend delivers one email.
 *  - When Resend answers 409 `invalid_idempotent_request` (same key, different payload: a job in
 *    the period was edited or deleted, or the alert changed, between two attempts), the email that
 *    went out covered the same period, so moving the marker to `windowEnd` skips nothing. A job
 *    created after the window's end is never in it, whenever the retry runs: it goes in the next
 *    period.
 *  - A different run (a later schedule, a manual run) has a different `windowEnd`, so a different
 *    key: it can never be mistaken for a repeat of another run's email.
 *  - Limit: the dedupe only holds while Resend still remembers the key (24 h), and only between
 *    attempts of one run. If the marker cannot be advanced for a whole retry chain (e.g. the
 *    database was down), the next run sends its own digest for the longer period: its jobs reach
 *    the user twice rather than never.
 */

export type AlertFrequency = "daily" | "twice_daily" | "weekly";
export const ALERT_FREQUENCIES: readonly AlertFrequency[] = ["daily", "twice_daily", "weekly"];

const HOUR_MS = 60 * 60 * 1000;

/**
 * Minimum gap between two window ends of the same alert. Schedules: daily 08:00 UTC; twice_daily
 * 08:00 + 18:00 UTC (gaps of 10 h and 14 h); weekly Monday 08:00 UTC. Markers hold the schedule's
 * fire time, so the gaps are exact, and each window is comfortably shorter than the real gap.
 */
export const ALERT_MIN_INTERVAL_MS: Record<AlertFrequency, number> = {
  daily: 20 * HOUR_MS,
  twice_daily: 8 * HOUR_MS,
  weekly: 6 * 24 * HOUR_MS,
};

/**
 * How far the jobs part of every period trails the period itself. A digest for the window end W
 * lists the jobs created up to W − 10 min; the ones from the last 10 minutes go in the next digest.
 * Every period is shifted by the same amount, so consecutive periods still meet exactly.
 *
 * Why: a period's jobs are read once, but a job becomes visible when its insert commits, which is
 * after its `created_at`, and W comes from Trigger's clock, which may run ahead of the app's by up
 * to `ALERT_WINDOW_END_MAX_FUTURE_MS`. Without the lag, a job stamped just before W but committed
 * after the read would be in neither digest.
 *
 * The lag is a guarantee, not a guess, because every jobs writer lets the database stamp
 * `created_at` (the inserting transaction's start) and bounds that transaction, so a row commits
 * within {@link JOBS_INSERT_MAX_LATENCY_MS} of its `created_at` or not at all (the jobs-writer rule
 * in `packages/db/src/jobs-insert.ts`). The run reads no earlier than W − the future tolerance, so
 * the lag must exceed `JOBS_INSERT_MAX_LATENCY_MS + ALERT_WINDOW_END_MAX_FUTURE_MS` (tested).
 */
export const ALERT_JOBS_SETTLE_MS = 10 * 60 * 1000;

/** Re-exported from `@ever-hust/db`: max time from a job's `created_at` to its commit. */
export { JOBS_INSERT_MAX_LATENCY_MS };

/** A never-sent alert's first digest covers this much time before its window end. */
export const ALERT_FIRST_SEND_LOOKBACK_MS = 24 * HOUR_MS;

/** At most this many jobs per digest (newest first). */
export const ALERT_MAX_JOBS = 20;

/**
 * Resend idempotency key for one alert period: the alert id, the `last_sent_at` the period started
 * from (`first` for a never-sent alert) and the run's window end. Every attempt of one run sends
 * the same key (and the same email); two different runs never share one, even from the same marker.
 */
export function jobAlertIdempotencyKey(alertId: number, previousSentAt: Date | null, windowEnd: Date): string {
  return `job-alert/${alertId}/${previousSentAt ? previousSentAt.getTime() : "first"}/${windowEnd.getTime()}`;
}

/** Alerts last sent before this instant are due again, for a run with this window end. */
export function alertPeriodCutoff(frequency: AlertFrequency, windowEnd: Date): Date {
  return new Date(windowEnd.getTime() - ALERT_MIN_INTERVAL_MS[frequency]);
}

/**
 * The jobs one digest lists: `created_at` in (`after`, `through`]. The period (`previous`,
 * `windowEnd`] shifted back by {@link ALERT_JOBS_SETTLE_MS}; a never-sent alert starts
 * {@link ALERT_FIRST_SEND_LOOKBACK_MS} before its window end.
 */
export function alertJobsWindow(previousSentAt: Date | null, windowEnd: Date): { after: Date; through: Date } {
  const start = previousSentAt?.getTime() ?? windowEnd.getTime() - ALERT_FIRST_SEND_LOOKBACK_MS;
  return {
    after: new Date(start - ALERT_JOBS_SETTLE_MS),
    through: new Date(windowEnd.getTime() - ALERT_JOBS_SETTLE_MS),
  };
}

type AlertDb = typeof defaultDb;

/**
 * Record a sent period: move `last_sent_at` from `previousSentAt` (the value the send's idempotency
 * key was derived from) to `windowEnd`, with `WHERE id = ? AND last_sent_at IS NOT DISTINCT FROM
 * previousSentAt`. Returns false (and changes nothing) when an overlapping run already advanced
 * it. Only this module writes the column, always from a JS Date, so the stored value round-trips
 * exactly (millisecond precision) and the equality is reliable.
 */
export async function advanceAlertMarker(
  database: AlertDb,
  alertId: number,
  previousSentAt: Date | null,
  windowEnd: Date,
  updatedAt: Date = new Date(),
): Promise<boolean> {
  const rows = await database
    .update(userAlerts)
    .set({ lastSentAt: windowEnd, updatedAt })
    .where(
      and(
        eq(userAlerts.id, alertId),
        previousSentAt === null ? isNull(userAlerts.lastSentAt) : eq(userAlerts.lastSentAt, previousSentAt),
      ),
    )
    .returning({ id: userAlerts.id });
  return rows.length > 0;
}

export interface AlertRunResult {
  frequency: AlertFrequency;
  /** Active alerts of this frequency not yet sent in the current period. */
  candidates: number;
  /** Resend accepted the email and this run recorded the period. */
  sent: number;
  /**
   * Nothing new was recorded by this run: Resend reported the period's key as already used (an
   * earlier attempt of this run delivered it), or an overlapping request recorded a period for the
   * alert first. For two attempts of one run, that is one key and one email. For two DIFFERENT runs
   * that overlap (e.g. a manual run during a scheduled one), the keys differ and both emails went
   * out; the marker then holds the first run's window end, so nothing is skipped.
   */
  deduplicated: number;
  /**
   * Another request with the same key was still in flight (an overlapping attempt of this run), so
   * this run did not record the period on its behalf. The run still answers non-2xx: the Trigger
   * retry finds the alert recorded, or repeats the same email with the same key.
   */
  skippedInFlight: number;
  skippedNotEligible: number;
  skippedNoCriteria: number;
  skippedNoMatches: number;
  /** The send failed, or it was accepted but the period could not be recorded. A retry resends with the same key. */
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
  /** The run's fixed window end; `now()` when absent. {@link runJobAlerts} validates it first. */
  windowEnd?: Date;
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
 * `failed` (its marker untouched, so the retry resends it with the same key) while the rest of the
 * batch continues.
 */
export async function processAlerts(
  frequency: AlertFrequency,
  deps: JobAlertDeps = {},
): Promise<AlertRunResult> {
  const database = deps.db ?? defaultDb;
  const send = deps.sendEmail ?? sendJobAlertEmail;
  const clock = deps.now ?? (() => new Date());
  const deadline = deps.deadline ?? Number.POSITIVE_INFINITY;
  const windowEnd = deps.windowEnd ?? clock();
  const result: AlertRunResult = {
    frequency,
    candidates: 0,
    sent: 0,
    deduplicated: 0,
    skippedInFlight: 0,
    skippedNotEligible: 0,
    skippedNoCriteria: 0,
    skippedNoMatches: 0,
    failed: 0,
    deferred: 0,
  };

  // Active alerts of this frequency that have not been sent for this window end (capped to prevent
  // OOM). Filtering on the period here is what lets a retry pick up where a run stopped. The cutoff
  // is taken from the window end, not the clock, so every attempt of the run sees the same alerts,
  // and a candidate's marker is always earlier than the window end (a marker never moves back).
  const alerts = await database
    .select()
    .from(userAlerts)
    .where(
      and(
        eq(userAlerts.frequency, frequency),
        eq(userAlerts.isActive, true),
        or(isNull(userAlerts.lastSentAt), lt(userAlerts.lastSentAt, alertPeriodCutoff(frequency, windowEnd))),
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

      // The period this digest covers: (marker, window end]. Both ends are fixed for the run, so
      // every attempt reads the same jobs and builds the same email under the same key; the window
      // end becomes the next marker. A job created after it is in the next period, never lost.
      const previousSentAt = alert.lastSentAt ?? null;
      const { after, through } = alertJobsWindow(previousSentAt, windowEnd);

      const conditions = [gt(jobs.createdAt, after), lte(jobs.createdAt, through)];

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
        // A fixed order (newest first, id as the tie-break) keeps the email identical on a retry.
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .limit(ALERT_MAX_JOBS);
      if (matchingJobs.length === 0) {
        result.skippedNoMatches++;
        continue;
      }

      const criteriaDesc =
        [...(criteria?.keywords ?? []), ...(criteria?.locations ?? []), criteria?.remoteType === "remote" ? "Remote" : null]
          .filter(Boolean)
          .join(", ") || "Your job preferences";

      // SEND, THEN ADVANCE. Every attempt of this run sends the same key and the same email, so
      // Resend delivers at most one email however many attempts reach this point. Nothing in the
      // email depends on the attempt (no clock reads, fixed job order).
      const outcome = await send({
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
        idempotencyKey: jobAlertIdempotencyKey(alert.id, previousSentAt, windowEnd),
      });
      const delivery = classifySendOutcome(outcome);
      if (delivery === "in_flight") {
        // Its outcome is unknown: never record the period on its behalf. The run answers non-2xx
        // (runJobAlerts), and the retry finds the period recorded or resends with the same key.
        result.skippedInFlight++;
        continue;
      }
      // `accepted` or `replayed`: an email for exactly this period went out under this key (a 409
      // replay means an earlier attempt of this run sent it), so the period is recorded.
      let advanced: boolean;
      try {
        advanced = await advanceAlertMarker(database, alert.id, previousSentAt, windowEnd, clock());
      } catch (advanceError) {
        throw new Error(
          `email accepted but the period could not be recorded (a retry resends it with the same idempotency key): ${
            advanceError instanceof Error ? advanceError.message : String(advanceError)
          }`,
        );
      }
      if (delivery === "accepted" && advanced) result.sent++;
      else result.deduplicated++;
    } catch (error) {
      result.failed++;
      console.error(`[job-alerts] alert ${alert.id} failed:`, error instanceof Error ? error.message : error);
    }
  }

  return result;
}

export interface JobAlertsRunResult {
  /** The run's window end (ISO 8601): the end of every period this run sent. */
  windowEnd: string;
  runs: AlertRunResult[];
  sent: number;
  deduplicated: number;
  skippedInFlight: number;
  failed: number;
  deferred: number;
}

/**
 * Run the given frequencies in order under one time budget and one window end. `windowEnd` is the
 * caller's (the Trigger task sends a value that is the same on every attempt of a run), or now when
 * absent; an unusable value throws {@link CronInputError} (400) before anything is read or sent
 * ({@link resolveAlertWindowEnd}). Throws {@link CronWorkError} (with all counters) when any alert
 * failed, was deferred or was left to an in-flight request of an overlapping run, so the route
 * answers non-2xx and the Trigger run shows FAILED and retries. The retry only sees alerts whose
 * marker has not moved, and repeats each one's email exactly (same period, key and payload).
 */
export async function runJobAlerts(
  frequencies: readonly AlertFrequency[],
  deps: Omit<JobAlertDeps, "windowEnd"> & { budgetMs?: number; windowEnd?: Date | string } = {},
): Promise<JobAlertsRunResult> {
  const clock = deps.now ?? (() => new Date());
  const windowEnd = resolveAlertWindowEnd(deps.windowEnd, clock());
  const deadline = deps.deadline ?? deadlineFrom(clock().getTime(), deps.budgetMs);
  const runs: AlertRunResult[] = [];
  for (const frequency of new Set(frequencies)) {
    runs.push(await processAlerts(frequency, { ...deps, now: clock, deadline, windowEnd }));
  }
  const total = {
    windowEnd: windowEnd.toISOString(),
    runs,
    sent: runs.reduce((n, r) => n + r.sent, 0),
    deduplicated: runs.reduce((n, r) => n + r.deduplicated, 0),
    skippedInFlight: runs.reduce((n, r) => n + r.skippedInFlight, 0),
    failed: runs.reduce((n, r) => n + r.failed, 0),
    deferred: runs.reduce((n, r) => n + r.deferred, 0),
  };
  if (total.failed > 0 || total.deferred > 0 || total.skippedInFlight > 0) {
    throw new CronWorkError(
      `Job alerts incomplete: ${total.failed} failed, ${total.deferred} deferred, ${total.skippedInFlight} in flight elsewhere (sent ${total.sent}).`,
      total,
    );
  }
  return total;
}
