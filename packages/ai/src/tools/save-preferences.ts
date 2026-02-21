import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { users } from "@repo/db";
import { eq } from "drizzle-orm";

export const savePreferencesTool = tool({
  description:
    "Save or update the user's job search preferences. Use this during onboarding or when the user explicitly updates their preferences. Merges with existing preferences.",
  inputSchema: z.object({
    // userId is injected server-side by the orchestrator — not LLM-provided
    userId: z.string().optional(),
    preferences: z
      .object({
        jobType: z
          .array(z.string().max(50))
          .max(10)
          .optional()
          .describe("Preferred job types: fulltime, parttime, contract, internship"),
        salaryMin: z
          .number()
          .int()
          .min(0)
          .max(10_000_000)
          .optional()
          .describe("Minimum desired annual salary in USD"),
        salaryMax: z
          .number()
          .int()
          .min(0)
          .max(10_000_000)
          .optional()
          .describe("Maximum desired annual salary in USD"),
        industries: z
          .array(z.string().max(200))
          .max(20)
          .optional()
          .describe("Preferred industries"),
        roleLevel: z
          .string()
          .max(50)
          .optional()
          .describe("Preferred role level: junior, mid, senior, lead, manager, executive"),
        locations: z
          .array(z.string().max(200))
          .max(20)
          .optional()
          .describe("Preferred job locations"),
        remotePreference: z
          .enum(["remote", "hybrid", "onsite", "any"])
          .optional()
          .describe("Remote work preference"),
        skills: z
          .array(z.string().max(100))
          .max(50)
          .optional()
          .describe("Key skills the user has or wants to use"),
        companySize: z
          .string()
          .max(50)
          .optional()
          .describe("Preferred company size: startup, small, medium, large, enterprise"),
        timeline: z
          .string()
          .max(50)
          .optional()
          .describe("Job search timeline: immediately, 1-2 weeks, 1 month, exploring"),
        dealBreakers: z
          .array(z.string().max(200))
          .max(10)
          .optional()
          .describe("Things the user wants to avoid"),
      })
      .describe("User preferences to save"),
    markOnboardingComplete: z
      .boolean()
      .optional()
      .describe("Set to true to mark onboarding as completed"),
  }),
  execute: async ({ userId, preferences, markOnboardingComplete }) => {
    if (!userId) return { saved: false, error: "Not authenticated" };

    try {
    // Use a transaction to prevent concurrent preference updates from overwriting each other
    const merged = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const existingPrefs =
        (existing[0]?.preferences as Record<string, unknown>) ?? {};

      const result = { ...existingPrefs, ...preferences };

      await tx
        .update(users)
        .set({
          preferences: result,
          updatedAt: new Date(),
          ...(markOnboardingComplete ? { onboardingCompleted: true } : {}),
        })
        .where(eq(users.id, userId));

      return result;
    });

    return {
      saved: true,
      preferences: merged,
      onboardingCompleted: !!markOnboardingComplete,
      message: markOnboardingComplete
        ? "Preferences saved and onboarding completed! Ready to find jobs."
        : "Preferences updated successfully.",
    };
    } catch (err) {
      console.error("[save-preferences] execute failed:", err instanceof Error ? err.message : err);
      return { saved: false, error: "Something went wrong while saving preferences. Please try again." };
    }
  },
});
