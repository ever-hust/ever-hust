import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { eq, ilike } from "drizzle-orm";
import { escapeIlike } from "@repo/db";

export const companyResearchTool = tool({
  description:
    "Research a company to provide information about their industry, size, culture, and open positions. Use when the user asks about a specific company.",
  inputSchema: z.object({
    companyName: z.string().describe("The name of the company to research"),
    jobId: z
      .number()
      .optional()
      .describe(
        "Optional job ID to get company info from a specific job listing"
      ),
  }),
  execute: async ({ companyName, jobId }) => {
    try {
      // If a specific jobId is provided, fetch its company info directly
      if (jobId !== undefined) {
        const jobResult = await db
          .select({
            companyName: jobs.companyName,
            companyUrl: jobs.companyUrl,
            companyLogo: jobs.companyLogo,
            companyIndustry: jobs.companyIndustry,
            companyNumEmployees: jobs.companyNumEmployees,
            companyDescription: jobs.companyDescription,
          })
          .from(jobs)
          .where(eq(jobs.id, jobId))
          .limit(1);

        if (jobResult.length > 0 && jobResult[0]!.companyName) {
          // Use the exact company name from this job for the broader search
          companyName = jobResult[0]!.companyName;
        }
      }

      const pattern = `%${escapeIlike(companyName)}%`;

      // Fetch all matching jobs from this company
      const companyJobs = await db
        .select({
          id: jobs.id,
          title: jobs.title,
          companyName: jobs.companyName,
          companyUrl: jobs.companyUrl,
          companyLogo: jobs.companyLogo,
          companyIndustry: jobs.companyIndustry,
          companyNumEmployees: jobs.companyNumEmployees,
          companyDescription: jobs.companyDescription,
          locationCity: jobs.locationCity,
          locationState: jobs.locationState,
          locationCountry: jobs.locationCountry,
          isRemote: jobs.isRemote,
          jobType: jobs.jobType,
          department: jobs.department,
          jobLevel: jobs.jobLevel,
          datePosted: jobs.datePosted,
        })
        .from(jobs)
        .where(ilike(jobs.companyName, pattern))
        .limit(200);

      if (companyJobs.length === 0) {
        return {
          error: `No jobs found from a company matching "${companyName}". The company may not have any open positions in our database.`,
          companyName,
        };
      }

      // Aggregate company information from the first matching job
      const firstJob = companyJobs[0]!;

      // Collect unique job titles
      const uniqueTitles = [
        ...new Set(
          companyJobs.map((j) => j.title).filter(Boolean) as string[]
        ),
      ];

      // Collect unique locations
      const locationSet = new Set<string>();
      for (const j of companyJobs) {
        const parts = [j.locationCity, j.locationState, j.locationCountry]
          .filter(Boolean)
          .join(", ");
        if (parts) locationSet.add(parts);
        if (j.isRemote) locationSet.add("Remote");
      }
      const uniqueLocations = [...locationSet];

      // Collect unique departments
      const uniqueDepartments = [
        ...new Set(
          companyJobs.map((j) => j.department).filter(Boolean) as string[]
        ),
      ];

      // Collect unique job levels
      const uniqueJobLevels = [
        ...new Set(
          companyJobs.map((j) => j.jobLevel).filter(Boolean) as string[]
        ),
      ];

      return {
        company: {
          name: firstJob.companyName,
          url: firstJob.companyUrl,
          logo: firstJob.companyLogo,
          industry: firstJob.companyIndustry,
          size: firstJob.companyNumEmployees,
          description: firstJob.companyDescription?.slice(0, 1500) ?? null,
        },
        openPositions: {
          totalCount: companyJobs.length,
          titles: uniqueTitles.slice(0, 30),
          locations: uniqueLocations,
          departments: uniqueDepartments,
          jobLevels: uniqueJobLevels,
        },
      };
    } catch (err) {
      console.error(
        "[company-research] execute failed:",
        err instanceof Error ? err.message : err
      );
      return {
        error:
          "Something went wrong while researching this company. Please try again.",
        companyName,
      };
    }
  },
});
