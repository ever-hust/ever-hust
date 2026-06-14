import { tool } from "ai";
import { z } from "zod";
import { db, applications } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";
import { PIPELINE_STAGES } from "../pipeline/stages";

/**
 * Move an application along the user's pipeline (spec #2 — Applications Kanban).
 *
 * Updates the user's own tracking stage (saved → applied → screening → interviewing → offer →
 * rejected/withdrawn). This edits the user's *own* record — it is NOT an outward action, so it
 * does not require an approval gate. `userId` is injected server-side.
 */
export const updateApplicationStageTool = tool({
  description:
    "Move a tracked application to a new pipeline stage (saved, applied, screening, interviewing, " +
    "offer, rejected, withdrawn). Use when the user says things like 'mark the Acme application as " +
    "interviewing' or 'I got an offer from X'. Updates the user's own tracking board.",
  inputSchema: z.object({
    applicationId: z
      .number()
      .int()
      .positive()
      .describe("The id of the application to move."),
    stage: z
      .enum(PIPELINE_STAGES)
      .describe("The new pipeline stage."),
    // injected server-side by the orchestrator
    userId: z.string().optional(),
  }),
  execute: async ({ applicationId, stage, userId }) => {
    if (!userId) {
      return { updated: false, applicationId, error: "Not authenticated." };
    }
    try {
      const now = new Date();
      const rows = await db
        .update(applications)
        .set({ pipelineStage: stage, stageChangedAt: now, updatedAt: now })
        .where(
          and(
            eq(applications.id, applicationId),
            eq(applications.userId, userId),
          ),
        )
        .returning({ id: applications.id });

      if (rows.length === 0) {
        return {
          updated: false,
          applicationId,
          error: "Application not found (or it isn't yours).",
        };
      }
      return { updated: true, applicationId, stage };
    } catch (err) {
      console.error(
        "[update-application-stage] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return {
        updated: false,
        applicationId,
        error: "Something went wrong while updating the application stage.",
      };
    }
  },
});
