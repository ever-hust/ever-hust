import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { eq } from "drizzle-orm";

export const getJobDetailsTool = tool({
  description:
    "Get full details for a specific job by its ID. Use when the user asks about a particular job or wants more information.",
  inputSchema: z.object({
    jobId: z.number().describe("The ID of the job to get details for"),
  }),
  execute: async ({ jobId }) => {
    try {
      const result = await db
        .select({
          id: jobs.id,
          externalId: jobs.externalId,
          title: jobs.title,
          companyName: jobs.companyName,
          companyUrl: jobs.companyUrl,
          companyLogo: jobs.companyLogo,
          companyIndustry: jobs.companyIndustry,
          companyNumEmployees: jobs.companyNumEmployees,
          companyDescription: jobs.companyDescription,
          jobUrl: jobs.jobUrl,
          applyUrl: jobs.applyUrl,
          locationCity: jobs.locationCity,
          locationState: jobs.locationState,
          locationCountry: jobs.locationCountry,
          isRemote: jobs.isRemote,
          jobType: jobs.jobType,
          description: jobs.description,
          skills: jobs.skills,
          department: jobs.department,
          jobLevel: jobs.jobLevel,
          jobFunction: jobs.jobFunction,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryCurrency: jobs.salaryCurrency,
          salaryInterval: jobs.salaryInterval,
          datePosted: jobs.datePosted,
          site: jobs.site,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);

      if (result.length === 0) {
        return { error: "Job not found", jobId };
      }

      const job = result[0]!;
      return {
        ...job,
        // Cap long text to prevent excessive token consumption in LLM context
        companyDescription: job.companyDescription?.slice(0, 1500) ?? null,
        description: job.description?.slice(0, 3000) ?? null,
      };
    } catch (err) {
      console.error("[get-job-details] execute failed:", err instanceof Error ? err.message : err);
      return { error: "Something went wrong while fetching job details. Please try again.", jobId };
    }
  },
});
