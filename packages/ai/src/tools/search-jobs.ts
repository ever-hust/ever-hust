import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { and, eq, ilike, or, gte, lte, desc, sql } from "drizzle-orm";

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
      .optional()
      .default(0)
      .describe("Offset for pagination"),
  }),
  execute: async (params) => {
    const conditions = [];

    // Escape ILIKE wildcard characters (%, _) in user input to prevent
    // unintended pattern matching. Backslash-escape is the Postgres default.
    const escapeIlike = (str: string) =>
      str.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

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

    if (params.salaryMin) {
      conditions.push(sql`${jobs.salaryMin}::numeric >= ${params.salaryMin}`);
    }

    if (params.salaryMax) {
      conditions.push(sql`${jobs.salaryMax}::numeric <= ${params.salaryMax}`);
    }

    if (params.skills && params.skills.length > 0) {
      // Check if the job's skills JSONB array contains any of the requested skills
      for (const skill of params.skills) {
        conditions.push(
          sql`${jobs.skills}::jsonb @> ${JSON.stringify([skill])}::jsonb`
        );
      }
    }

    const limit = Math.min(params.limit ?? 25, 50);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
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
      .offset(params.offset ?? 0);

    // Truncate descriptions for the response
    const jobResults = results.map((job) => ({
      ...job,
      description: job.description
        ? job.description.substring(0, 300) + "..."
        : null,
    }));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(where);

    const totalCount = Number(countResult[0]?.count ?? 0);

    return {
      jobs: jobResults,
      totalCount,
      limit,
      offset: params.offset ?? 0,
      hasMore: (params.offset ?? 0) + limit < totalCount,
    };
  },
});
