import { db, jobs, evaluations } from "@ever-hust/db";
import { and, eq, desc, sql } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";

/**
 * "Best for me" recommendations (spec #3 — personalised ranking).
 *
 * Ranks the corpus by THIS user's persisted job-fit evaluation score (spec #3): evaluated jobs
 * first, highest score first; un-evaluated jobs follow by recency. Authenticated + user-scoped —
 * the evaluation join is keyed to the signed-in user, so one user never sees another's scores.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  try {
    const [results, countResult] = await Promise.all([
      db
        .select({
          id: jobs.id,
          externalId: jobs.externalId,
          title: jobs.title,
          companyName: jobs.companyName,
          companyLogo: jobs.companyLogo,
          companyUrl: jobs.companyUrl,
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
          salaryInterval: jobs.salaryInterval,
          description: jobs.description,
          skills: jobs.skills,
          site: jobs.site,
          datePosted: jobs.datePosted,
          expiresAt: jobs.expiresAt,
          jobLevel: jobs.jobLevel,
          companyIndustry: jobs.companyIndustry,
          latitude: jobs.latitude,
          longitude: jobs.longitude,
          liveness: jobs.liveness,
          legitimacy: jobs.legitimacy,
          legitimacyReasons: jobs.legitimacyReasons,
          // The user's fit score for this job (null when not yet evaluated).
          fitScore: evaluations.score,
          fitBand: evaluations.band,
        })
        .from(jobs)
        .leftJoin(
          evaluations,
          and(eq(evaluations.jobId, jobs.id), eq(evaluations.userId, user.id)),
        )
        // Evaluated jobs first (highest fit first); the rest by recency.
        .orderBy(sql`${evaluations.score} DESC NULLS LAST`, desc(jobs.datePosted))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(jobs),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return apiSuccess(
      {
        jobs: results,
        total,
        limit,
        offset,
        hasMore: offset + results.length < total,
      },
      { cacheSeconds: 0, isPrivate: true },
    );
  } catch (err) {
    console.error(
      "[api/user/recommended-jobs] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to load recommendations");
  }
}
