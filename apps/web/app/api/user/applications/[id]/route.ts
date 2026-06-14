import { db, applications } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { isValidStage } from "@ever-hust/ai";
import { requireSessionUser } from "../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../../lib/api-response";

// PATCH /api/user/applications/[id] — move an application to a new pipeline stage (spec #2).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return apiBadRequest("Invalid application id");
  }

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const body = jsonResult.data as { stage?: unknown };
  if (typeof body.stage !== "string" || !isValidStage(body.stage)) {
    return apiBadRequest("Invalid pipeline stage");
  }

  try {
    const now = new Date();
    const rows = await db
      .update(applications)
      .set({ pipelineStage: body.stage, stageChangedAt: now, updatedAt: now })
      .where(and(eq(applications.id, id), eq(applications.userId, userId)))
      .returning({ id: applications.id });

    if (rows.length === 0) return apiError("Application not found", 404);
    return apiSuccess({ id, stage: body.stage });
  } catch (err) {
    console.error(
      "[api/user/applications/[id]] PATCH failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to update application stage");
  }
}
