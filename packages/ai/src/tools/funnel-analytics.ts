import { tool } from "ai";
import { z } from "zod";
import { db, applications, evaluations } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";
import { computeFunnel } from "../analytics/funnel";
import type { PipelineStage } from "../pipeline/stages";

/**
 * Funnel-analytics tool (spec #8). Reads THIS user's applications (pipeline stage) joined with
 * their evaluations (fit score) and returns the funnel: stage counts, conversion rates, average
 * fit, and the score-vs-outcome signal. `userId` is injected server-side.
 */
export const funnelAnalyticsTool = tool({
  description:
    "Summarize the user's job-search funnel: how many applications sit at each pipeline stage, " +
    "conversion rates (applied → screening → interviewing → offer), average fit score, and the " +
    "score-vs-outcome signal (do offers score higher than rejections). Use when the user asks " +
    "'how's my search going', 'what's my conversion rate', or 'am I applying to the right jobs'.",
  inputSchema: z.object({
    // injected server-side by the orchestrator
    userId: z.string().optional(),
  }),
  execute: async ({ userId }) => {
    if (!userId) return { error: "Not authenticated.", total: 0 };
    try {
      const rows = await db
        .select({
          stage: applications.pipelineStage,
          score: evaluations.score,
        })
        .from(applications)
        .leftJoin(
          evaluations,
          and(
            eq(evaluations.userId, applications.userId),
            eq(evaluations.jobId, applications.jobId),
          ),
        )
        .where(eq(applications.userId, userId))
        .limit(2000);

      const funnel = computeFunnel(
        rows.map((r) => ({
          stage: r.stage as PipelineStage,
          score: r.score ?? null,
        })),
      );
      return { ...funnel };
    } catch (err) {
      console.error(
        "[funnel-analytics] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return {
        error: "Something went wrong while computing your funnel. Please try again.",
        total: 0,
      };
    }
  },
});
