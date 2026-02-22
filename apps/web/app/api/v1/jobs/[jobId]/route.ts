import { db } from "@ever-hust/db";
import { jobs } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { validateApiKey } from "../../../../../lib/api-key-auth";
import { getSessionUser } from "../../../../../lib/get-session-user";
import { checkApiRateLimit } from "../../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiUnauthorized,
  apiNotFound,
  apiRateLimited,
  apiError,
} from "../../../../../lib/api-response";

// GET /api/v1/jobs/[jobId] - Get single job details (API key or session auth)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  // Authenticate via API key or session
  let rateLimitKey: string;
  let rateLimitMax: number;

  const apiKeyUser = await validateApiKey(req);
  if (apiKeyUser) {
    rateLimitKey = `api-key:${apiKeyUser.keyId}`;
    rateLimitMax = apiKeyUser.rateLimit;

    if (!apiKeyUser.scopes.includes("read")) {
      return apiUnauthorized("API key does not have 'read' scope");
    }
  } else {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return apiUnauthorized(
        "Provide a valid API key via Authorization header or sign in"
      );
    }
    rateLimitKey = `v1-session:${sessionUser.id}`;
    rateLimitMax = 100;
  }

  // Rate limit
  const rlResult = checkApiRateLimit(rateLimitKey, rateLimitMax, 3_600_000);
  if (!rlResult.allowed) {
    const retryAfter = Math.ceil((rlResult.resetAt - Date.now()) / 1000);
    return apiRateLimited(retryAfter);
  }

  const { jobId } = await params;
  const jobIdNum = Number(jobId);

  if (isNaN(jobIdNum) || jobIdNum <= 0 || !Number.isInteger(jobIdNum)) {
    return apiBadRequest("Invalid job ID");
  }

  try {
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
        latitude: jobs.latitude,
        longitude: jobs.longitude,
      })
      .from(jobs)
      .where(eq(jobs.id, jobIdNum))
      .limit(1);

    if (result.length === 0) {
      return apiNotFound("Job not found");
    }

    // Convert numeric salary fields from strings to numbers for API consumers
    const job = {
      ...result[0]!,
      salaryMin: result[0]!.salaryMin ? Number(result[0]!.salaryMin) : null,
      salaryMax: result[0]!.salaryMax ? Number(result[0]!.salaryMax) : null,
    };

    return apiSuccess(
      { job },
      {
        cacheSeconds: 300,
        headers: {
          "X-RateLimit-Limit": String(rateLimitMax),
          "X-RateLimit-Remaining": String(rlResult.remaining),
        },
      }
    );
  } catch (err) {
    console.error(
      "[api/v1/jobs/jobId] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to fetch job details");
  }
}
