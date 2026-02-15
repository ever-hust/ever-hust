import { db } from "@repo/db";
import { users, userJobs, jobs } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";

export async function GET() {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = sessionUser.id;

  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userResult.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const user = userResult[0]!;

  // Get favorite jobs
  const favorites = await db
    .select({
      jobId: userJobs.jobId,
      jobTitle: jobs.title,
      companyName: jobs.companyName,
      jobUrl: jobs.jobUrl,
      createdAt: userJobs.createdAt,
    })
    .from(userJobs)
    .innerJoin(jobs, eq(userJobs.jobId, jobs.id))
    .where(and(eq(userJobs.userId, userId), eq(userJobs.status, "favorited")))
    .limit(20);

  // Get applications
  const applications = await db
    .select({
      jobId: userJobs.jobId,
      jobTitle: jobs.title,
      companyName: jobs.companyName,
      jobUrl: jobs.jobUrl,
      appliedAt: userJobs.appliedAt,
      status: userJobs.status,
    })
    .from(userJobs)
    .innerJoin(jobs, eq(userJobs.jobId, jobs.id))
    .where(and(eq(userJobs.userId, userId), eq(userJobs.status, "applied")))
    .limit(20);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      headline: user.headline,
      location: user.location,
      photoUrl: user.photoUrl,
      skills: user.skills,
      experience: user.experience,
      preferences: user.preferences,
      cvParsedData: user.cvParsedData,
      subscriptionStatus: user.subscriptionStatus,
      onboardingCompleted: user.onboardingCompleted,
      createdAt: user.createdAt,
    },
    favorites,
    applications,
  });
}
