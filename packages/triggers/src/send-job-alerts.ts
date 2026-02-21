import { task, schedules } from "@trigger.dev/sdk/v3";
import { db, escapeIlike, userAlerts, jobs, users } from "@repo/db";
import { sendJobAlertEmail } from "@repo/email";
import { eq, and, gte, ilike, or, sql } from "drizzle-orm";

/**
 * Sends job alerts to users based on their alert frequency and criteria.
 * Called by scheduled triggers (daily, twice_daily, weekly).
 */
async function processAlerts(
  frequency: "daily" | "twice_daily" | "weekly"
) {
  // Get active alerts for this frequency (capped to prevent OOM)
  const alerts = await db
    .select()
    .from(userAlerts)
    .where(
      and(eq(userAlerts.frequency, frequency), eq(userAlerts.isActive, true))
    )
    .limit(5000);

  for (const alert of alerts) {
    try {
      // Get user info
      const userResult = await db
        .select({ name: users.name, subscriptionStatus: users.subscriptionStatus })
        .from(users)
        .where(eq(users.id, alert.userId))
        .limit(1);

      if (userResult.length === 0) continue;
      const user = userResult[0]!;

      // Only send to active subscribers (past_due retains access during grace period)
      if (user.subscriptionStatus !== "active" && user.subscriptionStatus !== "past_due") continue;

      // Build query conditions based on alert criteria
      const criteria = alert.criteria;

      // Skip alerts with no meaningful criteria — otherwise every recent job matches
      const hasAnyCriteria =
        (criteria?.keywords && criteria.keywords.length > 0) ||
        (criteria?.locations && criteria.locations.length > 0) ||
        (criteria?.skills && criteria.skills.length > 0) ||
        criteria?.remoteType === "remote";
      if (!hasAnyCriteria) continue;

      const conditions = [];

      // Time filter: jobs posted since last alert
      const since = alert.lastSentAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
      conditions.push(gte(jobs.createdAt, since));

      // Keyword matching
      if (criteria?.keywords && criteria.keywords.length > 0) {
        const keywordConditions = criteria.keywords.map((kw) =>
          or(
            ilike(jobs.title, `%${escapeIlike(kw)}%`),
            ilike(jobs.description, `%${escapeIlike(kw)}%`)
          )
        );
        const kwOr = or(...keywordConditions);
        if (kwOr) conditions.push(kwOr);
      }

      // Location matching
      if (criteria?.locations && criteria.locations.length > 0) {
        const locConditions = criteria.locations.map((loc) =>
          or(
            ilike(jobs.locationCity, `%${escapeIlike(loc)}%`),
            ilike(jobs.locationState, `%${escapeIlike(loc)}%`),
            ilike(jobs.locationCountry, `%${escapeIlike(loc)}%`)
          )
        );
        const locOr = or(...locConditions);
        if (locOr) conditions.push(locOr);
      }

      // Remote filter
      if (criteria?.remoteType === "remote") {
        conditions.push(eq(jobs.isRemote, true));
      }

      // Skills matching (GIN index on JSONB)
      if (criteria?.skills && criteria.skills.length > 0) {
        conditions.push(
          sql`${jobs.skills} ?| array[${sql.join(
            criteria.skills.map((s) => sql`${s}`),
            sql`, `
          )}]`
        );
      }

      // Query matching jobs
      const matchingJobs = await db
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

      if (matchingJobs.length === 0) continue;

      // Format salary string (numeric columns return as strings)
      const formatSalary = (
        min: string | null,
        max: string | null,
        currency: string | null
      ) => {
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
      };

      // Build criteria description for email
      const criteriaDesc = [
        ...(criteria?.keywords ?? []),
        ...(criteria?.locations ?? []),
        criteria?.remoteType === "remote" ? "Remote" : null,
      ]
        .filter(Boolean)
        .join(", ") || "Your job preferences";

      // Only include jobs with valid http(s) URLs
      const safeJobs = matchingJobs
        .map((j) => {
          let jobUrl = "#";
          if (j.jobUrl) {
            try {
              const parsed = new URL(j.jobUrl);
              if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                jobUrl = j.jobUrl;
              }
            } catch {
              // Invalid URL — skip link
            }
          }
          return {
            title: j.title,
            companyName: j.companyName ?? "Unknown Company",
            location: j.locationCity ?? undefined,
            isRemote: j.isRemote ?? undefined,
            salary: formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency),
            jobUrl,
          };
        });

      await sendJobAlertEmail({
        to: alert.email,
        userName: user.name ?? "Job Seeker",
        alertCriteria: criteriaDesc,
        jobs: safeJobs,
      });

      // Update last sent timestamp
      await db
        .update(userAlerts)
        .set({ lastSentAt: new Date(), updatedAt: new Date() })
        .where(eq(userAlerts.id, alert.id));
    } catch (error) {
      console.error(
        `Failed to process alert ${alert.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

// Task definition
export const sendJobAlertsTask = task({
  id: "send-job-alerts",
  run: async (payload: { frequency: "daily" | "twice_daily" | "weekly" }) => {
    await processAlerts(payload.frequency);
  },
});

// Scheduled triggers
// Daily alerts at 8 AM UTC
export const dailyAlertSchedule = schedules.task({
  id: "daily-job-alerts",
  cron: "0 8 * * *",
  run: async () => {
    await processAlerts("daily");
    await processAlerts("twice_daily");
  },
});

// Twice daily alerts at 6 PM UTC (second run)
export const eveningAlertSchedule = schedules.task({
  id: "evening-job-alerts",
  cron: "0 18 * * *",
  run: async () => {
    await processAlerts("twice_daily");
  },
});

// Weekly alerts on Monday at 8 AM UTC
export const weeklyAlertSchedule = schedules.task({
  id: "weekly-job-alerts",
  cron: "0 8 * * 1",
  run: async () => {
    await processAlerts("weekly");
  },
});
