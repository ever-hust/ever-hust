import { db as defaultDb, escapeIlike, userAlerts, jobs, users } from "@ever-hust/db";
import { sendJobAlertEmail } from "@ever-hust/email";
import { and, eq, gte, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { CronWorkError, deadlineFrom } from "./errors";
import { classifySendOutcome } from "./send-outcome";

/**
 * Job-alert emails (app-runtime work behind `POST /api/cron/job-alerts`).
 *
 * DELIVERY: at least once, with provider-side dedupe. No schema change: the period marker is the
 * existing `user_alerts.last_sent_at`. Per alert, SEND-THEN-ADVANCE:
 *  1. The candidate query only returns alerts not yet sent in this period, together with their
 *     current marker (`previous`).
 *  2. The email is sent with the Resend idempotency key `job-alert/<alertId>/<previous ms|first>`
 *     ({@link jobAlertIdempotencyKey}). Every attempt at the same period sends the SAME key, and
 *     Resend delivers at most one email per key (it remembers a key for 24 h).
 *  3. Only after Resend accepted (or reported the key as already used) is the marker advanced, with
 *     a conditional `UPDATE ... WHERE id = ? AND last_sent_at IS NOT DISTINCT FROM previous`
 *     ({@link advanceAlertMarker}). An overlapping run that already advanced it makes this a no-op.
 * Consequences:
 *  - A failed send leaves the marker untouched, so the Trigger retry sends that alert again, with
 *    the same key: an ambiguous failure (Resend accepted, the response was lost) is deduplicated.
 *  - A crash between the send and the advance also leaves the marker untouched: the retry re-sends
 *    with the same key and Resend dedupes. Nothing is skipped for a period any more.
 *  - Overlapping runs send the same key; Resend delivers one email.
 *  - Limit: the dedupe only holds while Resend still remembers the key (24 h). If the marker can
 *    not be advanced for longer than that (every retry failed, e.g. the database was down), the
 *    next scheduled run re-sends the digest: at least once, not exactly once.
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

/**
 * Resend idempotency key for one alert period: the alert id plus the `last_sent_at` the period
 * started from (`first` for a never-sent alert). The marker only moves after a send was accepted,
 * so every attempt at the same period (Trigger retry, re-run, overlapping run) sends the same key;
 * once the marker has moved, the next period gets a new key.
 */
export function jobAlertIdempotencyKey(alertId: number, previousSentAt: Date | null): string {
  return `job-alert/${alertId}/${previousSentAt ? previousSentAt.getTime() : "first"}`;
}

/** Alerts last sent before this instant are due again. */
export function alertPeriodCutoff(frequency: AlertFrequency, now: Date): Date {
  return new Date(now.getTime() - ALERT_MIN_INTERVAL_MS[frequency]);
}

type AlertDb = typeof defaultDb;

/**
 * Record a sent period: move `last_sent_at` from `previousSentAt` (the value the send's idempotency
 * key was derived from) to `sentAt`, with `WHERE id = ? AND last_sent_at IS NOT DISTINCT FROM
 * previousSentAt`. Returns false (and changes nothing) when an overlapping run already advanced
 * it. Only this module writes the column, always from a JS Date, so the stored value round-trips
 * exactly (millisecond precision) and the equality is reliable.
 */
export async function advanceAlertMarker(
  database: AlertDb,
  alertId: number,
  previousSentAt: Date | null,
  sentAt: Date,
): Promise<boolean> {
  const rows = await database
    .update(userAlerts)
    .set({ lastSentAt: sentAt, updatedAt: sentAt })
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
   * earlier attempt delivered it), or an overlapping run recorded the period first. Either way the
   * attempts shared one idempotency key, so the user got one email.
   */
  deduplicated: number;
  /**
   * Another request with the same key was still in flight (an overlapping run), so this run did
   * not record the period on its behalf. The run still answers non-2xx: the Trigger retry finds the
   * alert recorded, or resends it with the same key.
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

      // The period this digest covers: from the marker (the value the idempotency key is derived
      // from) to now. `periodEnd` becomes the next marker; it is taken before the jobs query, so a
      // job created while this alert is being sent lands in the next digest rather than in neither.
      const previousSentAt = alert.lastSentAt ?? null;
      const periodEnd = clock();

      const conditions = [];
      // Time filter: jobs posted since last alert
      const since = previousSentAt ?? new Date(periodEnd.getTime() - 24 * HOUR_MS);
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

      // SEND, THEN ADVANCE. Every attempt at this period sends the same key, so Resend delivers
      // at most one email however many attempts reach this point.
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
        idempotencyKey: jobAlertIdempotencyKey(alert.id, previousSentAt),
      });
      const delivery = classifySendOutcome(outcome);
      if (delivery === "in_flight") {
        // Its outcome is unknown: never record the period on its behalf. The run answers non-2xx
        // (runJobAlerts), and the retry finds the period recorded or resends with the same key.
        result.skippedInFlight++;
        continue;
      }
      let advanced: boolean;
      try {
        advanced = await advanceAlertMarker(database, alert.id, previousSentAt, periodEnd);
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
  runs: AlertRunResult[];
  sent: number;
  deduplicated: number;
  skippedInFlight: number;
  failed: number;
  deferred: number;
}

/**
 * Run the given frequencies in order under one time budget. Throws {@link CronWorkError} (with
 * all counters) when any alert failed, was deferred or was left to an in-flight request of an
 * overlapping run, so the route answers non-2xx and the Trigger run shows FAILED and retries. The
 * retry only sees alerts whose marker has not moved, and resends each with the same key.
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
