import { db } from "@repo/db";
import { sql } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../../lib/api-response";

export const maxDuration = 30;

export async function GET() {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "adminWrite");
  if (rateLimited) return rateLimited;

  try {
    const [
      topLocationsResult,
      remoteBreakdownResult,
      topCompaniesResult,
      jobLevelResult,
      salaryRangesResult,
    ] = await Promise.all([
      // Top 10 locations by job count
      db.execute(sql`
        SELECT
          COALESCE(location_country, 'Unknown') as location,
          COUNT(*)::int as count
        FROM jobs
        WHERE location_country IS NOT NULL
        GROUP BY location_country
        ORDER BY count DESC
        LIMIT 10
      `),

      // Remote vs onsite breakdown
      db.execute(sql`
        SELECT
          CASE WHEN is_remote = true THEN 'Remote' ELSE 'On-site' END as type,
          COUNT(*)::int as count
        FROM jobs
        GROUP BY is_remote
        ORDER BY count DESC
      `),

      // Top 10 companies by job count
      db.execute(sql`
        SELECT
          COALESCE(company_name, 'Unknown') as company,
          COUNT(*)::int as count
        FROM jobs
        WHERE company_name IS NOT NULL
        GROUP BY company_name
        ORDER BY count DESC
        LIMIT 10
      `),

      // Job level distribution
      db.execute(sql`
        SELECT
          COALESCE(job_level, 'Unspecified') as level,
          COUNT(*)::int as count
        FROM jobs
        GROUP BY job_level
        ORDER BY count DESC
      `),

      // Salary range buckets
      db.execute(sql`
        SELECT
          CASE
            WHEN salary_min::numeric < 30000 THEN '< $30k'
            WHEN salary_min::numeric < 50000 THEN '$30k - $50k'
            WHEN salary_min::numeric < 75000 THEN '$50k - $75k'
            WHEN salary_min::numeric < 100000 THEN '$75k - $100k'
            WHEN salary_min::numeric < 150000 THEN '$100k - $150k'
            ELSE '$150k+'
          END as range,
          COUNT(*)::int as count
        FROM jobs
        WHERE salary_min IS NOT NULL
        GROUP BY range
        ORDER BY MIN(salary_min::numeric)
      `),
    ]);

    const topLocations = (
      topLocationsResult as unknown as Array<{
        location: string;
        count: number;
      }>
    ).map((r) => ({ location: String(r.location), count: Number(r.count) }));

    const remoteBreakdown = (
      remoteBreakdownResult as unknown as Array<{
        type: string;
        count: number;
      }>
    ).map((r) => ({ type: String(r.type), count: Number(r.count) }));

    const topCompanies = (
      topCompaniesResult as unknown as Array<{
        company: string;
        count: number;
      }>
    ).map((r) => ({ company: String(r.company), count: Number(r.count) }));

    const jobLevelDistribution = (
      jobLevelResult as unknown as Array<{ level: string; count: number }>
    ).map((r) => ({ level: String(r.level), count: Number(r.count) }));

    const salaryRanges = (
      salaryRangesResult as unknown as Array<{ range: string; count: number }>
    ).map((r) => ({ range: String(r.range), count: Number(r.count) }));

    return apiSuccess({
      topLocations,
      remoteBreakdown,
      topCompanies,
      jobLevelDistribution,
      salaryRanges,
    });
  } catch (err) {
    console.error(
      "[api/admin/analytics/job-stats] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to fetch job statistics");
  }
}
