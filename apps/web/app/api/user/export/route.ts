import {
  db,
  users,
  userJobs,
  applications,
  chatSessions,
  chatMessages,
  userAlerts,
} from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiError } from "../../../../lib/api-response";
import type { UserPreferences } from "../../../../lib/api-schemas";

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

  // Heavy endpoint — stricter rate limit (5 req/min)
  const rateLimited = applyRateLimit(userId, "export");
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

    // Fetch chat messages for user's sessions in a single query (avoids N+1)
    const sessionIds = sessions.map((s) => s.id);
    let messages: unknown[] = [];
    if (sessionIds.length > 0) {
      messages = await db
        .select()
        .from(chatMessages)
        .where(inArray(chatMessages.sessionId, sessionIds));
    }

    // Redact sensitive BYOK API keys from the export
    const profileData = profile[0] ?? null;
    if (profileData) {
      const prefs = profileData.preferences as UserPreferences | null;
      if (prefs?.apiKeys) {
        (profileData as Record<string, unknown>).preferences = {
          ...prefs,
          apiKeys: {
            anthropic: !!prefs.apiKeys.anthropic,
            openai: !!prefs.apiKeys.openai,
            google: !!prefs.apiKeys.google,
          },
        };
      }
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      profile: profileData,
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
