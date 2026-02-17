import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiError,
} from "../../../../lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Public endpoint — rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(ip, "public");
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const jobId = Number(id);

  if (isNaN(jobId)) {
    return apiBadRequest("Invalid job ID");
  }

  try {
    const result = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (result.length === 0) {
      return apiNotFound("Job not found");
    }

    // Job posts change infrequently — cache for 5 minutes at the edge
    return apiSuccess({ job: result[0] }, { cacheSeconds: 300 });
  } catch (err) {
    console.error("[api/jobs/id] Database query failed:", err);
    return apiError("Failed to fetch job details");
  }
}
