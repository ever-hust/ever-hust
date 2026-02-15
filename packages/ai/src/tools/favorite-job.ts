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
    userId: z.string().describe("The current user's ID"),
  }),
  execute: async ({ jobId, userId }) => {
    // Check if already favorited
    const existing = await db
      .select()
      .from(userJobs)
      .where(
        and(
          eq(userJobs.userId, userId),
          eq(userJobs.jobId, jobId),
          eq(userJobs.status, "favorited")
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Remove favorite
      await db
        .delete(userJobs)
        .where(eq(userJobs.id, existing[0]!.id));

      return {
        jobId,
        favorited: false,
        message: "Job removed from favorites.",
      };
    }

    // Add favorite
    await db.insert(userJobs).values({
      userId,
      jobId,
      status: "favorited",
    });

    return {
      jobId,
      favorited: true,
      message: "Job added to favorites!",
    };
  },
});
