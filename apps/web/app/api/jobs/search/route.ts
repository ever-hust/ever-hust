import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { and, eq, gte, lte, ilike, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { jobSearchParamsSchema } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";

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
    return NextResponse.json(
      {
        error: "Invalid search parameters",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { page, limit, keywords, location, isRemote, jobType, salaryMin, salaryMax } =
    parsed.data;

  const conditions = [];

  if (keywords) {
    conditions.push(
      sql`(${ilike(jobs.title, `%${keywords}%`)} OR ${ilike(jobs.companyName, `%${keywords}%`)})`
    );
  }

  if (location) {
    conditions.push(
      sql`(${ilike(jobs.locationCity, `%${location}%`)} OR ${ilike(jobs.locationState, `%${location}%`)} OR ${ilike(jobs.locationCountry, `%${location}%`)})`
    );
  }

  if (isRemote) {
    conditions.push(eq(jobs.isRemote, true));
  }

  if (salaryMin !== undefined) {
    conditions.push(gte(jobs.salaryMin, salaryMin.toString()));
  }

  if (salaryMax !== undefined) {
    conditions.push(lte(jobs.salaryMax, salaryMax.toString()));
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

  return NextResponse.json({
    jobs: result,
    total,
    page,
    limit,
    hasMore: offset + result.length < total,
  });
}
