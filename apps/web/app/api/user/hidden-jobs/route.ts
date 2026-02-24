import { db, userJobs } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";
import { auth } from "@ever-hust/auth";
import { headers } from "next/headers";
import { apiSuccess, apiUnauthorized, apiError, apiBadRequest } from "../../../../lib/api-response";

/**
 * POST /api/user/hidden-jobs — Hide a job for the user
 * DELETE /api/user/hidden-jobs — Unhide a job
 * GET /api/user/hidden-jobs — List hidden job IDs
 */

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return apiUnauthorized();

  try {
    const result = await db
      .select({ jobId: userJobs.jobId })
      .from(userJobs)
      .where(
        and(
          eq(userJobs.userId, session.user.id),
          eq(userJobs.status, "hidden")
        )
      );

    return apiSuccess({ hiddenJobIds: result.map((r) => r.jobId) });
  } catch (err) {
    console.error("[hidden-jobs] GET error:", err);
    return apiError("Failed to fetch hidden jobs");
  }
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return apiUnauthorized();

  try {
    const body = await req.json();
    const jobId = Number(body.jobId);
    if (!Number.isFinite(jobId)) return apiBadRequest("Invalid jobId");

    await db
      .insert(userJobs)
      .values({
        userId: session.user.id,
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
    console.error("[hidden-jobs] POST error:", err);
    return apiError("Failed to hide job");
  }
}

export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return apiUnauthorized();

  try {
    const url = new URL(req.url);
    const jobId = Number(url.searchParams.get("jobId"));
    if (!Number.isFinite(jobId)) return apiBadRequest("Invalid jobId");

    await db
      .delete(userJobs)
      .where(
        and(
          eq(userJobs.userId, session.user.id),
          eq(userJobs.jobId, jobId),
          eq(userJobs.status, "hidden")
        )
      );

    return apiSuccess({ hidden: false, jobId });
  } catch (err) {
    console.error("[hidden-jobs] DELETE error:", err);
    return apiError("Failed to unhide job");
  }
}
