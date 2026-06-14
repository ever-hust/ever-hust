import { tool } from "ai";
import { z } from "zod";
import { db, applications } from "@ever-hust/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Record that the user sent a follow-up (spec #9) — increments the count + timestamps it so the
 * cadence cap is respected over time. Edits the user's OWN record; not an outward action (the
 * sending is manual / HITL), so no approval gate. `userId` injected server-side.
 */
export const recordFollowUpTool = tool({
  description:
    "Record that the user sent a follow-up for an application (increments the follow-up count and " +
    "timestamps it). Use AFTER the user confirms they've followed up, so future nudges respect the cap.",
  inputSchema: z.object({
    applicationId: z.number().int().positive(),
    userId: z.string().optional(),
  }),
  execute: async ({ applicationId, userId }) => {
    if (!userId) return { recorded: false, applicationId, error: "Not authenticated." };
    try {
      const now = new Date();
      const rows = await db
        .update(applications)
        .set({
          followUpCount: sql`${applications.followUpCount} + 1`,
          lastFollowUpAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(applications.id, applicationId), eq(applications.userId, userId)),
        )
        .returning({
          id: applications.id,
          followUpCount: applications.followUpCount,
        });
      if (rows.length === 0) {
        return {
          recorded: false,
          applicationId,
          error: "Application not found (or it isn't yours).",
        };
      }
      return { recorded: true, applicationId, followUpCount: rows[0]!.followUpCount };
    } catch (err) {
      console.error(
        "[record-follow-up] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return {
        recorded: false,
        applicationId,
        error: "Something went wrong while recording the follow-up.",
      };
    }
  },
});
