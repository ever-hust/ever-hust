import { db } from "@repo/db";
import { userJobs } from "@repo/db";
import { jobs } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

// GET /api/user/favorites - Get user's favorited job IDs
export async function GET() {
  // TODO: Get actual user from session
  const userId = "dev-user";

  const favorites = await db
    .select({ jobId: userJobs.jobId })
    .from(userJobs)
    .where(and(eq(userJobs.userId, userId), eq(userJobs.status, "favorited")));

  return NextResponse.json({
    favoriteJobIds: favorites.map((f) => f.jobId),
  });
}

// POST /api/user/favorites - Toggle favorite for a job
export async function POST(req: Request) {
  const userId = "dev-user";
  const { jobId } = (await req.json()) as { jobId: number };

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  // Check if already favorited
  const existing = await db
    .select()
    .from(userJobs)
    .where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)))
    .limit(1);

  if (existing.length > 0 && existing[0]!.status === "favorited") {
    // Unfavorite - delete the record
    await db
      .delete(userJobs)
      .where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)));

    return NextResponse.json({ jobId, favorited: false });
  }

  if (existing.length > 0) {
    // Update existing record to favorited
    await db
      .update(userJobs)
      .set({ status: "favorited" as const, updatedAt: new Date() })
      .where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)));
  } else {
    // Create new favorite
    await db.insert(userJobs).values({
      userId,
      jobId,
      status: "favorited",
    });
  }

  return NextResponse.json({ jobId, favorited: true });
}
