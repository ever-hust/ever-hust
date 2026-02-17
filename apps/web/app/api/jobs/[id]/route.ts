import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit } from "../../../../lib/rate-limit";

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
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const result = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (result.length === 0) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job: result[0] });
}
