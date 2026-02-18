import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { userJobs } from "@repo/db";
import { and, eq } from "drizzle-orm";

export const favoriteJobTool = tool({
  description:
    "Toggle a job as favorited for the current user. If already favorited, it removes the favorite. If not favorited, it adds it.",
  inputSchema: z.object({
    jobId: z.number().describe("The ID of the job to favorite/unfavorite"),
    // userId is injected server-side by the orchestrator — not LLM-provided
    userId: z.string().optional(),
  }),
  execute: async ({ jobId, userId }) => {
    if (!userId) return { jobId, favorited: false, message: "Not authenticated" };

    try {
    // Check for any existing userJobs record (regardless of status)
    // to avoid unique constraint violations when toggling favorites
    const existing = await db
      .select({ id: userJobs.id, status: userJobs.status })
      .from(userJobs)
      .where(
        and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId))
      )
      .limit(1);

    if (existing.length > 0 && existing[0]!.status === "favorited") {
      // Already favorited — remove the favorite
      await db
        .delete(userJobs)
        .where(eq(userJobs.id, existing[0]!.id));

      return {
        jobId,
        favorited: false,
        message: "Job removed from favorites.",
      };
    }

    if (existing.length > 0) {
      // Existing record with different status (e.g. "applied") — update to favorited
      await db
        .update(userJobs)
        .set({ status: "favorited", updatedAt: new Date() })
        .where(eq(userJobs.id, existing[0]!.id));
    } else {
      // No existing record — insert new favorite
      await db.insert(userJobs).values({
        userId,
        jobId,
        status: "favorited",
      });
    }

    return {
      jobId,
      favorited: true,
      message: "Job added to favorites!",
    };
    } catch (err) {
      console.error("[favorite-job] execute failed:", err instanceof Error ? err.message : err);
      return { jobId, favorited: false, message: "Something went wrong while updating favorites. Please try again." };
    }
  },
});
