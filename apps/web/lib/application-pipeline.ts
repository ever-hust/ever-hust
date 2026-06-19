import { db, applications } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";
import type { EmailCategory } from "./email-classify";

export type PipelineStage =
  | "saved"
  | "applied"
  | "screening"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn";

/**
 * Map an inbound email category to the next pipeline stage, advance-only:
 * - rejection → rejected (terminal signal, always wins unless already terminal)
 * - offer → offer
 * - interview/scheduling → interviewing (only from earlier stages)
 * Returns null when nothing should change.
 */
export function nextStageFor(current: PipelineStage, category: EmailCategory): PipelineStage | null {
  if (category === "rejection") {
    return current === "rejected" || current === "withdrawn" ? null : "rejected";
  }
  // Don't move out of terminal/offer stages (rejection handled above).
  if (current === "rejected" || current === "withdrawn" || current === "offer") return null;
  if (category === "offer") return "offer";
  if (category === "interview" || category === "scheduling") {
    return current === "saved" || current === "applied" || current === "screening"
      ? "interviewing"
      : null;
  }
  return null;
}

/**
 * Advance the user's application for a job based on an inbound email's category.
 * Only updates an EXISTING application row — never fabricates one (a recruiter
 * email matched to a merely-saved job shouldn't invent an application). Returns
 * the new stage if it changed, else null. Never throws.
 */
export async function advanceApplicationStage(
  userId: string,
  jobId: number,
  category: EmailCategory,
): Promise<PipelineStage | null> {
  try {
    const rows = await db
      .select({ id: applications.id, stage: applications.pipelineStage })
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const target = nextStageFor(row.stage as PipelineStage, category);
    if (!target || target === row.stage) return null;
    await db
      .update(applications)
      .set({ pipelineStage: target, stageChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(applications.id, row.id));
    return target;
  } catch (err) {
    console.error("[application-pipeline] advance failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
