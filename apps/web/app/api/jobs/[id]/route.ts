import { db } from "@ever-hust/db";
import { jobs } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiError,
} from "../../../../lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Public endpoint — rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(ip, "public");
  if (rateLimited) return rateLimited;

  const { id } = await params;

  if (!id || id.trim() === "") {
    return apiBadRequest("Job ID is required");
  }

  const jobId = Number(id);

  if (isNaN(jobId) || jobId <= 0 || !Number.isInteger(jobId)) {
    return apiBadRequest("Invalid job ID");
  }

  try {
    // Explicit column projection — omit rawData (large internal JSONB blob)
    const result = await db
      .select({
        id: jobs.id,
        externalId: jobs.externalId,
        site: jobs.site,
        title: jobs.title,
        companyName: jobs.companyName,
        companyUrl: jobs.companyUrl,
        companyLogo: jobs.companyLogo,
        companyIndustry: jobs.companyIndustry,
        companyNumEmployees: jobs.companyNumEmployees,
        companyDescription: jobs.companyDescription,
        jobUrl: jobs.jobUrl,
        jobUrlDirect: jobs.jobUrlDirect,
        applyUrl: jobs.applyUrl,
        locationCity: jobs.locationCity,
        locationState: jobs.locationState,
        locationCountry: jobs.locationCountry,
        isRemote: jobs.isRemote,
        jobType: jobs.jobType,
        description: jobs.description,
        skills: jobs.skills,
        department: jobs.department,
        team: jobs.team,
        employmentType: jobs.employmentType,
        jobLevel: jobs.jobLevel,
        jobFunction: jobs.jobFunction,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        salaryCurrency: jobs.salaryCurrency,
        salaryInterval: jobs.salaryInterval,
        salarySource: jobs.salarySource,
        datePosted: jobs.datePosted,
        expiresAt: jobs.expiresAt,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (result.length === 0) {
      return apiNotFound("Job not found");
    }

    // Job posts change infrequently — cache for 5 minutes at the edge
    return apiSuccess({ job: result[0] }, { cacheSeconds: 300 });
  } catch (err) {
    console.error("[api/jobs/id] Database query failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to fetch job details");
  }
}
