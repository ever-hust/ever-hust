import { db, evaluations, jobs } from "@ever-hust/db";
import { eq, and } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError, apiBadRequest } from "../../../../lib/api-response";

// GET /api/evaluations/[jobId] — fetch THIS user's persisted job-fit evaluation (spec #3).
// Read-only; the evaluation is produced + persisted by the evaluateJob AI tool.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const { jobId: jobIdRaw } = await params;
  const jobId = Number(jobIdRaw);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return apiBadRequest("Invalid job id");
  }

  try {
    const rows = await db
      .select({
        jobId: evaluations.jobId,
        score: evaluations.score,
        score5: evaluations.score5,
        band: evaluations.band,
        jobFamily: evaluations.jobFamily,
        archetype: evaluations.archetype,
        dimensions: evaluations.dimensions,
        blocks: evaluations.blocks,
        recommendation: evaluations.recommendation,
        updatedAt: evaluations.updatedAt,
        jobTitle: jobs.title,
        companyName: jobs.companyName,
      })
      .from(evaluations)
      .innerJoin(jobs, eq(jobs.id, evaluations.jobId))
      .where(and(eq(evaluations.userId, userId), eq(evaluations.jobId, jobId)))
      .limit(1);

    const row = rows[0];
    if (!row) return apiError("No evaluation found for this job", 404);

    return apiSuccess({ evaluation: row });
  } catch (err) {
    console.error(
      "[api/evaluations] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to load evaluation");
  }
}
