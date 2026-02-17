import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { userAlerts, users } from "@repo/db";
import { eq } from "drizzle-orm";

export const createAlertTool = tool({
  description:
    "Create a job alert for the user. The user will receive email notifications at their specified frequency when new matching jobs are found. Only available for Pro subscribers.",
  inputSchema: z.object({
    // userId is injected server-side by the orchestrator — not LLM-provided
    userId: z.string().optional(),
    frequency: z
      .enum(["daily", "twice_daily", "weekly"])
      .describe("How often to send alerts"),
    keywords: z
      .array(z.string().max(200))
      .max(20)
      .optional()
      .describe("Keywords to match in job titles/descriptions"),
    locations: z
      .array(z.string().max(200))
      .max(10)
      .optional()
      .describe("Locations to filter by"),
    remoteType: z
      .enum(["remote", "onsite", "any"])
      .optional()
      .describe("Remote work preference"),
    skills: z
      .array(z.string().max(100))
      .max(30)
      .optional()
      .describe("Skills to match against job requirements"),
    roleLevel: z
      .array(z.string().max(50))
      .max(10)
      .optional()
      .describe("Role levels like junior, mid, senior, lead"),
    industries: z
      .array(z.string().max(200))
      .max(20)
      .optional()
      .describe("Industry preferences"),
  }),
  execute: async ({
    userId,
    frequency,
    keywords,
    locations,
    remoteType,
    skills,
    roleLevel,
    industries,
  }) => {
    if (!userId) return { created: false, error: "Not authenticated" };

    try {
    // Check subscription
    const userResult = await db
      .select({
        email: users.email,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return { created: false, error: "User not found" };
    }

    const user = userResult[0]!;

    if (user.subscriptionStatus !== "active") {
      return {
        created: false,
        error: "Job alerts require a Pro subscription. Upgrade to get alerts.",
        requiresUpgrade: true,
      };
    }

    // Create the alert
    const result = await db
      .insert(userAlerts)
      .values({
        userId,
        frequency,
        email: user.email,
        criteria: {
          keywords: keywords ?? [],
          locations: locations ?? [],
          remoteType: remoteType ?? "any",
          skills: skills ?? [],
          roleLevel: roleLevel ?? [],
          industries: industries ?? [],
        },
        isActive: true,
      })
      .returning({ id: userAlerts.id });

    const alertId = result[0]?.id;

    const frequencyLabel =
      frequency === "daily"
        ? "once daily (8 AM)"
        : frequency === "twice_daily"
          ? "twice daily (8 AM & 6 PM)"
          : "weekly (Monday 8 AM)";

    return {
      created: true,
      alertId,
      summary: {
        frequency: frequencyLabel,
        email: user.email,
        keywords: keywords ?? [],
        locations: locations ?? [],
        remoteType: remoteType ?? "any",
        skills: skills ?? [],
      },
    };
    } catch (err) {
      console.error("[create-alert] execute failed:", err instanceof Error ? err.message : err);
      return { created: false, error: "Something went wrong while creating the alert. Please try again." };
    }
  },
});
