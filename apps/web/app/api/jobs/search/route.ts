import { db } from "@repo/db";
import { jobs } from "@repo/db";
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

    // Escape ILIKE wildcard characters (%, _) in user input to prevent
    // unintended pattern matching. Backslash-escape is the Postgres default.
    const escapeIlike = (str: string) =>
      str.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

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
      // Use numeric comparison (salary columns are numeric type in DB)
      conditions.push(sql`${jobs.salaryMin}::numeric >= ${safeSalaryMin}`);
    }

    if (safeSalaryMax !== undefined) {
      conditions.push(sql`${jobs.salaryMax}::numeric <= ${safeSalaryMax}`);
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
    console.error("[api/jobs/search] Database query failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to search jobs. Please try again.");
  }
}
