import { jobs, userJobs, escapeIlike } from "@ever-hust/db";
import { eq, ilike, sql, type SQL } from "drizzle-orm";

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
}

export function buildJobFilterConditions(p: JobFilterParams): SQL[] {
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

  if (p.company) {
    conditions.push(sql`lower(${jobs.companyName}) = ${p.company.toLowerCase()}`);
  }

  return conditions;
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
