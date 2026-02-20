import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { and, eq, ilike, or, gte, lte, desc, sql } from "drizzle-orm";
import { escapeIlike } from "@repo/db";

export const searchJobsTool = tool({
  description:
    "Search for jobs based on keywords, location, remote preference, salary range, and job type. Returns matching jobs from the database. Always use this when the user asks to find, search, or look for jobs.",
  inputSchema: z.object({
    keywords: z
      .string()
      .max(500)
      .optional()
      .describe("Search keywords for job title or description"),
    location: z
      .string()
      .max(200)
      .optional()
      .describe("City, state, or country to filter jobs by"),
    isRemote: z
      .boolean()
      .optional()
      .describe("Filter for remote jobs only"),
    jobType: z
      .enum(["fulltime", "parttime", "internship", "contract"])
      .optional()
      .describe("Type of employment"),
    salaryMin: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .optional()
      .describe("Minimum annual salary in USD"),
    salaryMax: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .optional()
      .describe("Maximum annual salary in USD"),
    skills: z
      .array(z.string().max(100))
      .max(20)
      .optional()
      .describe("Required skills to filter by"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(25)
      .describe("Number of results to return (max 50)"),
    offset: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .optional()
      .default(0)
      .describe("Offset for pagination (max 10000)"),
  }),
  execute: async (params) => {
    try {
    const conditions = [];

    if (params.keywords) {
      const kw = `%${escapeIlike(params.keywords)}%`;
      conditions.push(
        or(ilike(jobs.title, kw), ilike(jobs.description, kw))
      );
    }

    if (params.location) {
      const loc = `%${escapeIlike(params.location)}%`;
      conditions.push(
        or(
          ilike(jobs.locationCity, loc),
          ilike(jobs.locationState, loc),
          ilike(jobs.locationCountry, loc)
        )
      );
    }

    if (params.isRemote !== undefined) {
      conditions.push(eq(jobs.isRemote, params.isRemote));
    }

    if (params.jobType) {
      conditions.push(
        sql`${jobs.jobType}::jsonb @> ${JSON.stringify([params.jobType])}::jsonb`
      );
    }

    if (params.salaryMin !== undefined) {
      conditions.push(sql`${jobs.salaryMin}::numeric >= ${params.salaryMin}`);
    }

    if (params.salaryMax !== undefined) {
      conditions.push(sql`${jobs.salaryMax}::numeric <= ${params.salaryMax}`);
    }

    if (params.skills && params.skills.length > 0) {
      // Match jobs that have ANY of the requested skills (OR semantics).
      // Users searching for ["React", "Vue"] want jobs that require either,
      // not only jobs requiring both.
      const skillConditions = params.skills.map(
        (skill) =>
          sql`${jobs.skills}::jsonb @> ${JSON.stringify([skill])}::jsonb`
      );
      conditions.push(or(...skillConditions));
    }

    const limit = Math.min(params.limit ?? 25, 50);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Run search and count queries in parallel for better performance
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
          jobLevel: jobs.jobLevel,
          companyIndustry: jobs.companyIndustry,
        })
        .from(jobs)
        .where(where)
        .orderBy(desc(jobs.datePosted))
        .limit(limit)
        .offset(params.offset ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(where),
    ]);

    // Truncate long descriptions to keep tool responses concise
    const jobResults = results.map((job) => ({
      ...job,
      description: job.description
        ? job.description.length > 300
          ? job.description.substring(0, 300) + "..."
          : job.description
        : null,
    }));

    const totalCount = Number(countResult[0]?.count ?? 0);

    return {
      jobs: jobResults,
      totalCount,
      limit,
      offset: params.offset ?? 0,
      hasMore: (params.offset ?? 0) + limit < totalCount,
    };
    } catch (err) {
      console.error("[search-jobs] execute failed:", err instanceof Error ? err.message : err);
      return { jobs: [], totalCount: 0, limit: 0, offset: 0, hasMore: false, error: "Something went wrong while searching for jobs. Please try again." };
    }
  },
});
