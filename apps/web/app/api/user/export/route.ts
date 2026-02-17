import {
  db,
  users,
  userJobs,
  applications,
  chatSessions,
  chatMessages,
  userAlerts,
} from "@repo/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiError } from "../../../../lib/api-response";

/**
 * GET /api/user/export — Export all user data as a JSON download.
 * GDPR-compliant data portability endpoint.
 */
export async function GET() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Heavy endpoint — stricter rate limit
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    // Fetch all user data in parallel
    const [profile, favorites, apps, sessions, alerts] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
          headline: users.headline,
          location: users.location,
          photoUrl: users.photoUrl,
          skills: users.skills,
          experience: users.experience,
          preferences: users.preferences,
          cvParsedData: users.cvParsedData,
          subscriptionStatus: users.subscriptionStatus,
          onboardingCompleted: users.onboardingCompleted,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      db
        .select()
        .from(userJobs)
        .where(eq(userJobs.userId, userId)),
      db
        .select()
        .from(applications)
        .where(eq(applications.userId, userId)),
      db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.userId, userId)),
      db
        .select()
        .from(userAlerts)
        .where(eq(userAlerts.userId, userId)),
    ]);

    // Fetch chat messages for user's sessions
    const sessionIds = sessions.map((s) => s.id);
    let messages: unknown[] = [];
    if (sessionIds.length > 0) {
      const messageResults = await Promise.all(
        sessionIds.map((sid) =>
          db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.sessionId, sid))
        )
      );
      messages = messageResults.flat();
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      profile: profile[0] ?? null,
      favorites,
      applications: apps,
      chatSessions: sessions,
      chatMessages: messages,
      alerts,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ever-jobs-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error(
      "[user/export] Failed to export user data:",
      error instanceof Error ? error.message : error,
    );
    return apiError("Failed to export user data. Please try again later.");
  }
}
