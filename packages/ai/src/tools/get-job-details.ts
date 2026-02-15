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
    const result = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (result.length === 0) {
      return { error: "Job not found", jobId };
    }

    const job = result[0]!;
    return {
      id: job.id,
      externalId: job.externalId,
      title: job.title,
      companyName: job.companyName,
      companyUrl: job.companyUrl,
      companyLogo: job.companyLogo,
      companyIndustry: job.companyIndustry,
      companyNumEmployees: job.companyNumEmployees,
      companyDescription: job.companyDescription,
      jobUrl: job.jobUrl,
      applyUrl: job.applyUrl,
      locationCity: job.locationCity,
      locationState: job.locationState,
      locationCountry: job.locationCountry,
      isRemote: job.isRemote,
      jobType: job.jobType,
      description: job.description,
      skills: job.skills,
      department: job.department,
      jobLevel: job.jobLevel,
      jobFunction: job.jobFunction,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryInterval: job.salaryInterval,
      datePosted: job.datePosted,
      site: job.site,
    };
  },
});
