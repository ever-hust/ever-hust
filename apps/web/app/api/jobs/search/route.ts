import { db, escapeIlike } from "@ever-hust/db";
import { jobs } from "@ever-hust/db";
import { and, eq, ilike, desc, sql } from "drizzle-orm";
import { jobSearchParamsSchema } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError } from "../../../../lib/api-response";

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
    // Drop NaN salary values instead of passing them to SQL
    const safeSalaryMin = salaryMin !== undefined && Number.isFinite(salaryMin) ? salaryMin : undefined;
    const safeSalaryMax = salaryMax !== undefined && Number.isFinite(salaryMax) ? salaryMax : undefined;

    const conditions = [];

    if (keywords) {
      const kw = `%${escapeIlike(keywords)}%`;
      conditions.push(
        sql`(${ilike(jobs.title, kw)} OR ${ilike(jobs.companyName, kw)})`
      );
    }

    if (location) {
      const loc = `%${escapeIlike(location)}%`;
      conditions.push(
        sql`(${ilike(jobs.locationCity, loc)} OR ${ilike(jobs.locationState, loc)} OR ${ilike(jobs.locationCountry, loc)})`
      );
    }

    if (isRemote) {
      conditions.push(eq(jobs.isRemote, true));
    }

    if (jobType) {
      // jobType is stored as a JSONB string array — check if the array contains the value
      conditions.push(
        sql`${jobs.jobType}::jsonb @> ${JSON.stringify([jobType])}::jsonb`
      );
    }

    if (safeSalaryMin !== undefined) {
      // Overlap: job's max salary must be at or above the user's minimum
      conditions.push(sql`${jobs.salaryMax}::numeric >= ${safeSalaryMin}`);
    }

    if (safeSalaryMax !== undefined) {
      // Overlap: job's min salary must be at or below the user's maximum
      conditions.push(sql`${jobs.salaryMin}::numeric <= ${safeSalaryMax}`);
    }

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
          jobLevel: jobs.jobLevel,
          companyIndustry: jobs.companyIndustry,
          latitude: jobs.latitude,
          longitude: jobs.longitude,
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

    // Search results are semi-dynamic — cache for 2 minutes at the edge
    return apiSuccess(
      {
        jobs: result,
        total,
        page,
        limit,
        hasMore: offset + result.length < total,
      },
      { cacheSeconds: 120 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = (err as any)?.cause;
    console.error("[api/jobs/search] Database query failed:", msg);
    if (cause) console.error("[api/jobs/search] Cause:", cause.code, cause.message ?? cause);
    return apiError("Failed to search jobs. Please try again.");
  }
}
