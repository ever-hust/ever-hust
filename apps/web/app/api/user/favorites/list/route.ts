import { db } from "@repo/db";
import { userJobs, jobs } from "@repo/db";
import { eq, and, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../lib/rate-limit";

/**
 * GET /api/user/favorites/list
 * Returns full job details for all user favorites, ordered by most recently saved.
 */
export async function GET() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const favorites = await db
    .select({
      // User-job metadata
      savedAt: userJobs.createdAt,
      notes: userJobs.notes,
      // Job details
      id: jobs.id,
      title: jobs.title,
      companyName: jobs.companyName,
      companyLogo: jobs.companyLogo,
      companyIndustry: jobs.companyIndustry,
      jobUrl: jobs.jobUrl,
      applyUrl: jobs.applyUrl,
      locationCity: jobs.locationCity,
      locationState: jobs.locationState,
      locationCountry: jobs.locationCountry,
      isRemote: jobs.isRemote,
      jobType: jobs.jobType,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency,
      skills: jobs.skills,
      datePosted: jobs.datePosted,
      jobLevel: jobs.jobLevel,
    })
    .from(userJobs)
    .innerJoin(jobs, eq(userJobs.jobId, jobs.id))
    .where(and(eq(userJobs.userId, user.id), eq(userJobs.status, "favorited")))
    .orderBy(desc(userJobs.createdAt))
    .limit(100);

  return NextResponse.json({ favorites });
}
