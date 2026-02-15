import { tool } from "ai";
import { z } from "zod";

export const updateFiltersTool = tool({
  description:
    "Update the job search filters displayed on the canvas/jobs panel. Use this when the user wants to change search criteria, refine results, or set new preferences for job browsing.",
  inputSchema: z.object({
    keywords: z.string().optional().describe("Search keywords"),
    location: z.string().optional().describe("Location filter"),
    isRemote: z.boolean().optional().describe("Remote filter"),
    jobType: z
      .enum(["fulltime", "parttime", "internship", "contract"])
      .optional()
      .describe("Job type filter"),
    salaryMin: z.number().optional().describe("Minimum salary"),
    salaryMax: z.number().optional().describe("Maximum salary"),
    skills: z.array(z.string()).optional().describe("Skills filter"),
  }),
  execute: async (params) => {
    // This tool's result is consumed by the canvas sync hook on the client
    // to update the filter UI state
    return {
      filters: params,
      message: "Filters updated on the jobs canvas.",
    };
  },
});
