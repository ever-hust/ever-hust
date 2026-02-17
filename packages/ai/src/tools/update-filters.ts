import { tool } from "ai";
import { z } from "zod";

export const updateFiltersTool = tool({
  description:
    "Update the job search filters displayed on the canvas/jobs panel. Use this when the user wants to change search criteria, refine results, or set new preferences for job browsing.",
  inputSchema: z.object({
    keywords: z.string().max(500).optional().describe("Search keywords"),
    location: z.string().max(200).optional().describe("Location filter"),
    isRemote: z.boolean().optional().describe("Remote filter"),
    jobType: z
      .enum(["fulltime", "parttime", "internship", "contract"])
      .optional()
      .describe("Job type filter"),
    salaryMin: z.number().int().min(0).max(10_000_000).optional().describe("Minimum salary"),
    salaryMax: z.number().int().min(0).max(10_000_000).optional().describe("Maximum salary"),
    skills: z.array(z.string().max(100)).max(20).optional().describe("Skills filter"),
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
