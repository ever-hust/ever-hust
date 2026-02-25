import { db, userJobs } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { hiddenJobToggleSchema, parseBody } from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../lib/api-response";

/**
 * POST /api/user/hidden-jobs — Hide a job for the user
 * DELETE /api/user/hidden-jobs — Unhide a job
 * GET /api/user/hidden-jobs — List hidden job IDs
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const result = await db
      .select({ jobId: userJobs.jobId })
      .from(userJobs)
      .where(
        and(
          eq(userJobs.userId, user.id),
          eq(userJobs.status, "hidden")
        )
      );

    return apiSuccess({ hiddenJobIds: result.map((r) => r.jobId) });
  } catch (err) {
    console.error(
      "[api/user/hidden-jobs] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to fetch hidden jobs");
  }
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(hiddenJobToggleSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const { jobId } = validation.data;

  try {
    await db
      .insert(userJobs)
      .values({
        userId: user.id,
        jobId,
        status: "hidden",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userJobs.userId, userJobs.jobId],
        set: { status: "hidden", updatedAt: new Date() },
      });

    return apiSuccess({ hidden: true, jobId });
  } catch (err) {
    console.error(
      "[api/user/hidden-jobs] POST failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to hide job");
  }
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const url = new URL(req.url);
  const rawJobId = url.searchParams.get("jobId");
  const jobId = Number(rawJobId);
  if (!rawJobId || !Number.isFinite(jobId) || jobId < 1) {
    return apiBadRequest("Invalid or missing jobId query parameter");
  }

  try {
    await db
      .delete(userJobs)
      .where(
        and(
          eq(userJobs.userId, user.id),
          eq(userJobs.jobId, jobId),
          eq(userJobs.status, "hidden")
        )
      );

    return apiSuccess({ hidden: false, jobId });
  } catch (err) {
    console.error(
      "[api/user/hidden-jobs] DELETE failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to unhide job");
  }
}
