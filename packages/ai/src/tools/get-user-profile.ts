import { tool } from "ai";
import { z } from "zod";
import { db } from "@ever-hust/db";
import { users } from "@ever-hust/db";
import { eq } from "drizzle-orm";

export const getUserProfileTool = tool({
  description:
    "Get the current user's profile information including their name, skills, preferences, CV data (work history, education, summary), and onboarding status. Use this to personalize recommendations, check if onboarding is needed, or access the user's CV-extracted data for job matching and resume building.",
  inputSchema: z.object({
    // userId is injected server-side by the orchestrator — not LLM-provided
    userId: z.string().optional(),
  }),
  execute: async ({ userId }) => {
    if (!userId) return { found: false, onboardingCompleted: false, message: "Not authenticated" };

    try {
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        headline: users.headline,
        location: users.location,
        skills: users.skills,
        preferences: users.preferences,
        onboardingCompleted: users.onboardingCompleted,
        photoUrl: users.photoUrl,
        cvParsedData: users.cvParsedData,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (result.length === 0) {
      return {
        found: false,
        onboardingCompleted: false,
        message: "User not found — treat as new user.",
      };
    }

    const user = result[0]!;
    // Strip sensitive fields (encrypted API keys) before returning to LLM context
    const prefs = user.preferences as Record<string, unknown> | null;
    const safePreferences = prefs
      ? { ...prefs, apiKeys: undefined }
      : undefined;

    // Strip PII and rawText from CV data before returning to LLM context
    // Keep: headline, summary, skills, experience (title+company+dates), education
    // Omit: email, phone, rawText (too large / PII)
    const rawCv = user.cvParsedData as Record<string, unknown> | null;
    let safeCvData: Record<string, unknown> | undefined;
    if (rawCv) {
      safeCvData = {
        headline: rawCv.headline,
        summary: rawCv.summary,
        skills: rawCv.skills,
        experience: rawCv.experience,
        education: rawCv.education,
        location: rawCv.location,
        name: rawCv.name,
      };
    }

    return {
      found: true,
      ...user,
      cvParsedData: safeCvData,
      preferences: safePreferences,
      onboardingCompleted: !!user.onboardingCompleted,
    };
    } catch (err) {
      console.error("[get-user-profile] execute failed:", err instanceof Error ? err.message : err);
      return { found: false, onboardingCompleted: false, message: "Something went wrong while loading your profile. Please try again." };
    }
  },
});
