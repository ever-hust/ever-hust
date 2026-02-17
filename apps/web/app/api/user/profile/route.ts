import { db } from "@repo/db";
import { users, userJobs, jobs } from "@repo/db";
import { eq, and } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { profilePatchSchema, parseBody } from "../../../../lib/api-schemas";
import type { UserPreferences } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiNotFound, apiError, safeJsonParse } from "../../../../lib/api-response";

export async function GET() {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = sessionUser.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return apiNotFound("User not found");
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

    // Get applications — include the row id as a stable React key
    const applications = await db
      .select({
        id: userJobs.id,
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

    // Redact sensitive BYOK API keys from the response — only indicate
    // whether each key is configured (true/false) so the UI can show status
    // without exposing the raw secret.
    const prefs = user.preferences as UserPreferences | null;
    let safePreferences: Record<string, unknown> | null = prefs;
    if (prefs?.apiKeys) {
      safePreferences = {
        ...prefs,
        apiKeys: {
          anthropic: !!prefs.apiKeys.anthropic,
          openai: !!prefs.apiKeys.openai,
          google: !!prefs.apiKeys.google,
        },
      };
    }

    return apiSuccess({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        headline: user.headline,
        location: user.location,
        photoUrl: user.photoUrl,
        skills: user.skills,
        experience: user.experience,
        preferences: safePreferences,
        cvParsedData: user.cvParsedData,
        subscriptionStatus: user.subscriptionStatus,
        onboardingCompleted: user.onboardingCompleted,
        createdAt: user.createdAt,
      },
      favorites,
      applications,
    });
  } catch (err) {
    console.error("[api/user/profile] GET failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to load profile");
  }
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

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(profilePatchSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
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
    return apiBadRequest("No valid fields to update");
  }

  try {
    await db.update(users).set(updates).where(eq(users.id, userId));
    return apiSuccess({ updated: true });
  } catch (err) {
    console.error("[api/user/profile] PATCH failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to update profile");
  }
}
