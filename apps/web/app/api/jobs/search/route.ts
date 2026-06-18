import { db } from "@ever-hust/db";
import { jobs } from "@ever-hust/db";
import { and, desc, sql } from "drizzle-orm";
import { jobSearchParamsSchema } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError } from "../../../../lib/api-response";
import { getSessionUser } from "../../../../lib/get-session-user";
import {
  buildJobFilterConditions,
  hiddenJobsExclusion,
} from "../../../../lib/job-search-filters";

export async function GET(req: Request) {
  // Rate limit by IP for public search endpoint (20 req/min)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(ip, "public");
  if (rateLimited) return rateLimited;

  const url = new URL(req.url);

  // Validate and parse query params with Zod
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = jobSearchParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return apiBadRequest(
      "Invalid search parameters",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { page, limit, keywords, location, isRemote, jobType, salaryMin, salaryMax } =
    parsed.data;

  try {
    // Exclude jobs the signed-in user has hidden (item 8). Optional auth — the
    // endpoint stays public for anonymous visitors.
    const user = await getSessionUser();

    const conditions = buildJobFilterConditions({
      keywords,
      location,
      isRemote,
      jobType,
      salaryMin,
      salaryMax,
    });
    if (user) conditions.push(hiddenJobsExclusion(user.id));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const offset = (page - 1) * limit;

    const [result, countResult] = await Promise.all([
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
          // Corpus signals (spec #4 liveness / #7 legitimacy) — null when absent.
          liveness: jobs.liveness,
          legitimacy: jobs.legitimacy,
          legitimacyReasons: jobs.legitimacyReasons,
        })
        .from(jobs)
        .where(where)
        .orderBy(desc(jobs.datePosted))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    // Anonymous results are identical per query → cache 2 min at the edge.
    // Authenticated results are user-filtered (hidden jobs) → never shared-cache.
    return apiSuccess(
      {
        jobs: result,
        total,
        page,
        limit,
        hasMore: offset + result.length < total,
      },
      user ? undefined : { cacheSeconds: 120 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? (err as Error & { cause?: { code?: string; message?: string } }).cause : undefined;
    console.error("[api/jobs/search] Database query failed:", msg);
    if (cause) console.error("[api/jobs/search] Cause:", cause.code, cause.message ?? cause);
    return apiError("Failed to search jobs. Please try again.");
  }
}
