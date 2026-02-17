import { db } from "@repo/db";
import { users, userJobs, jobs } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { profilePatchSchema, parseBody } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";

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

/**
 * PATCH /api/user/profile
 * Update user profile fields (name, headline, location, skills, experience).
 */
export async function PATCH(req: Request) {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = sessionUser.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const rawBody = await req.json();
  const validation = parseBody(profilePatchSchema, rawBody);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const body = validation.data;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.headline !== undefined) updates.headline = body.headline;
  if (body.location !== undefined) updates.location = body.location;
  if (body.skills !== undefined) updates.skills = body.skills;
  if (body.experience !== undefined) updates.experience = body.experience;
  if (body.onboardingCompleted !== undefined)
    updates.onboardingCompleted = body.onboardingCompleted;

  if (Object.keys(updates).length <= 1) {
    // Only updatedAt — no actual fields to update
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  return NextResponse.json({ updated: true });
}
