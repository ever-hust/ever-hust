import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { users } from "@repo/db";
import { eq } from "drizzle-orm";

export const getUserProfileTool = tool({
  description:
    "Get the current user's profile information including their name, skills, preferences, and onboarding status. Use this to personalize recommendations and check if onboarding is needed.",
  inputSchema: z.object({
    userId: z.string().describe("The current user's ID"),
  }),
  execute: async ({ userId }) => {
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
    return {
      found: true,
      ...user,
      onboardingCompleted: !!user.onboardingCompleted,
    };
  },
});
