import { tool } from "ai";
import { z } from "zod";
import { db, applications, jobs } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { computeFollowUpSuggestions } from "../cadence/follow-ups";
import type { PipelineStage } from "../pipeline/stages";

/**
 * Follow-up suggestions tool (spec #9). Reads THIS user's active applications and returns the
 * ones due for a follow-up, capped by the cadence policy (spec #6). Read-only; `userId` injected.
 */
export const followUpSuggestionsTool = tool({
  description:
    "Suggest which applications are due for a follow-up — capped so nudging never becomes spam. " +
    "Use when the user asks 'who should I follow up with', 'any nudges due', or to proactively " +
    "surface stale applications.",
  inputSchema: z.object({
    userId: z.string().optional(),
  }),
  execute: async ({ userId }) => {
    if (!userId) return { error: "Not authenticated.", suggestions: [], count: 0 };
    try {
      const rows = await db
        .select({
          id: applications.id,
          stage: applications.pipelineStage,
          stageChangedAt: applications.stageChangedAt,
          followUpCount: applications.followUpCount,
          lastFollowUpAt: applications.lastFollowUpAt,
          jobTitle: jobs.title,
          companyName: jobs.companyName,
        })
        .from(applications)
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .where(eq(applications.userId, userId))
        .limit(500);

      const suggestions = computeFollowUpSuggestions(
        rows.map((r) => ({
          applicationId: r.id,
          jobTitle: r.jobTitle,
          companyName: r.companyName,
          stage: r.stage as PipelineStage,
          stageChangedAt: r.stageChangedAt,
          followUpCount: r.followUpCount,
          lastFollowUpAt: r.lastFollowUpAt,
        })),
        new Date(),
      );
      return { suggestions, count: suggestions.length };
    } catch (err) {
      console.error(
        "[follow-up-suggestions] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return {
        error: "Something went wrong while finding follow-ups. Please try again.",
        suggestions: [],
        count: 0,
      };
    }
  },
});
