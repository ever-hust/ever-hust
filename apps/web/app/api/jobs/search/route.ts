import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { and, eq, gte, lte, ilike, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // Parse and validate numeric params (NaN-safe)
    const rawPage = Number(url.searchParams.get("page") ?? "1");
    const rawLimit = Number(url.searchParams.get("limit") ?? "25");
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 25;

    const keywords = url.searchParams.get("keywords") || undefined;
    const location = url.searchParams.get("location") || undefined;
    const isRemote = url.searchParams.get("isRemote") === "true" ? true : undefined;
    const jobType = url.searchParams.get("jobType") || undefined;

    const rawSalaryMin = url.searchParams.get("salaryMin");
    const rawSalaryMax = url.searchParams.get("salaryMax");
    const salaryMin = rawSalaryMin ? Number(rawSalaryMin) : undefined;
    const salaryMax = rawSalaryMax ? Number(rawSalaryMax) : undefined;

    // Drop NaN salary values instead of passing them to SQL
    const safeSalaryMin = salaryMin !== undefined && Number.isFinite(salaryMin) ? salaryMin : undefined;
    const safeSalaryMax = salaryMax !== undefined && Number.isFinite(salaryMax) ? salaryMax : undefined;

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

    return NextResponse.json({
      jobs: result,
      total,
      page,
      limit,
      hasMore: offset + result.length < total,
    });
  } catch (err) {
    console.error("[api/jobs/search] Database query failed:", err);
    return NextResponse.json(
      { error: "Failed to search jobs. Please try again." },
      { status: 500 },
    );
  }
}
