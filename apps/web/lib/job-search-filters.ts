import { jobs, userJobs, escapeIlike } from "@ever-hust/db";
import { eq, gte, ilike, sql, type SQL } from "drizzle-orm";

/**
 * Shared job-filter builder used by both the paged search endpoint
 * (`/api/jobs/search`) and the full-set map endpoint (`/api/jobs/map`) so the
 * two always agree on what "the current result set" means.
 */
export interface JobFilterParams {
  keywords?: string;
  location?: string;
  isRemote?: boolean;
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  /** Exact (case-insensitive) company match — used by company pages. */
  company?: string;
  /**
   * Only jobs posted within the last N days. Jobs without a posted date are excluded
   * while this is active (their age is unknown, so they can't honour "last 7 days").
   */
  postedWithinDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildJobFilterConditions(p: JobFilterParams, now: Date = new Date()): SQL[] {
  const conditions: SQL[] = [];

  if (p.keywords) {
    const kw = `%${escapeIlike(p.keywords)}%`;
    conditions.push(sql`(${ilike(jobs.title, kw)} OR ${ilike(jobs.companyName, kw)})`);
  }

  if (p.location) {
    const loc = `%${escapeIlike(p.location)}%`;
    conditions.push(
      sql`(${ilike(jobs.locationCity, loc)} OR ${ilike(jobs.locationState, loc)} OR ${ilike(jobs.locationCountry, loc)})`,
    );
  }

  if (p.isRemote) {
    conditions.push(eq(jobs.isRemote, true));
  }

  if (p.jobType) {
    // jobType is a JSONB string array — contains check.
    conditions.push(sql`${jobs.jobType}::jsonb @> ${JSON.stringify([p.jobType])}::jsonb`);
  }

  const sMin =
    p.salaryMin !== undefined && Number.isFinite(p.salaryMin) ? p.salaryMin : undefined;
  const sMax =
    p.salaryMax !== undefined && Number.isFinite(p.salaryMax) ? p.salaryMax : undefined;
  if (sMin !== undefined) conditions.push(sql`${jobs.salaryMax}::numeric >= ${sMin}`);
  if (sMax !== undefined) conditions.push(sql`${jobs.salaryMin}::numeric <= ${sMax}`);

  // Bounded 1..365 so a bad caller can't build an absurd or negative window.
  if (
    p.postedWithinDays !== undefined &&
    Number.isFinite(p.postedWithinDays) &&
    p.postedWithinDays >= 1 &&
    p.postedWithinDays <= 365
  ) {
    conditions.push(gte(jobs.datePosted, new Date(now.getTime() - p.postedWithinDays * DAY_MS)));
  }

  if (p.company) {
    conditions.push(sql`lower(${jobs.companyName}) = ${p.company.toLowerCase()}`);
  }

  return conditions;
}

/**
 * "Newest first" ordering for job lists. Postgres sorts NULLs FIRST under `DESC` by default, so a
 * plain `desc(date_posted)` put every job without a posted date at the top of page 1 (and filled
 * the map cap with them). Dated jobs come first, newest first; undated ones last.
 */
export function newestFirst(): SQL {
  return sql`${jobs.datePosted} DESC NULLS LAST`;
}

/**
 * Exclude jobs the signed-in user has hidden (`user_jobs.status = 'hidden'`).
 * Fast anti-join — covered by the `user_jobs_status_idx (user_id, status)` and
 * the `(user_id, job_id)` unique index.
 */
export function hiddenJobsExclusion(userId: string): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${userJobs}
    WHERE ${userJobs.jobId} = ${jobs.id}
      AND ${userJobs.userId} = ${userId}
      AND ${userJobs.status} = 'hidden'
  )`;
}
