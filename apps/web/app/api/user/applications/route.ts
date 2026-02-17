import { db, applications, jobs } from "@repo/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError } from "../../../../lib/api-response";
import { z } from "zod";

const applicationsQuerySchema = z.object({
  status: z.enum(["pending", "in_progress", "submitted", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/user/applications - Get user's job applications
export async function GET(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const url = new URL(req.url);
  const queryParsed = applicationsQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!queryParsed.success) {
    return apiBadRequest("Invalid query parameters");
  }

  const { status, limit, offset } = queryParsed.data;

  try {
    // Build conditions
    const conditions = [eq(applications.userId, userId)];
    if (status) {
      conditions.push(eq(applications.status, status));
    }

    const where = and(...conditions);

    const [results, countResult] = await Promise.all([
      db
        .select({
          id: applications.id,
          jobId: applications.jobId,
          status: applications.status,
          coverLetter: applications.coverLetter,
          createdAt: applications.createdAt,
          updatedAt: applications.updatedAt,
          // Join job info
          jobTitle: jobs.title,
          companyName: jobs.companyName,
          companyLogo: jobs.companyLogo,
          locationCity: jobs.locationCity,
          locationState: jobs.locationState,
          isRemote: jobs.isRemote,
        })
        .from(applications)
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .where(where)
        .orderBy(desc(applications.updatedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(applications)
        .where(eq(applications.userId, userId)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return apiSuccess({
      applications: results,
      total,
      offset,
      limit,
      hasMore: offset + results.length < total,
    });
  } catch (err) {
    console.error("[api/user/applications] GET failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to load applications");
  }
}
