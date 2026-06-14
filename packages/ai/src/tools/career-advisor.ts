import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, evaluations } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import {
  careerGrowthArtifact,
  careerGrowthLlmPartSchema,
  type CareerGrowthSummary,
} from "../structured/schemas/career-growth";
import { assertArtifact, generateValidatedObject } from "../structured";
import { aggregateGaps } from "../analytics/gaps";

/**
 * Career-growth advisor (spec #18). Aggregates the recurring CV-match gaps across the user's
 * evaluations (spec #3) and turns that rejection/fit data into prioritized growth actions
 * (skills, projects, certifications). `userId` + `model` injected server-side.
 */
export const careerAdvisorTool = tool({
  description:
    "Turn the user's recurring evaluation gaps into a prioritized growth plan — the skills, " +
    "projects, or certifications that would most improve their fit for target roles. Use when the " +
    "user asks 'what should I learn / work on', 'how do I become more competitive', or 'why do I " +
    "keep falling short'. Requires that some jobs have been evaluated first.",
  inputSchema: z.object({
    userId: z.string().optional(),
  }),
  execute: async (input) => {
    const { userId } = input as { userId?: string };
    const model = (input as { model?: LanguageModel }).model;
    if (!userId) return { advised: false, error: "Not authenticated." };
    if (!model) return { advised: false, error: "No model available." };

    try {
      const rows = await db
        .select({ blocks: evaluations.blocks })
        .from(evaluations)
        .where(eq(evaluations.userId, userId))
        .limit(500);

      if (rows.length === 0) {
        return {
          advised: false,
          error:
            "No evaluations yet. Evaluate a few jobs first so I can spot recurring gaps.",
        };
      }

      const recurringGaps = aggregateGaps(
        rows.map((r) => ({ gaps: r.blocks?.cvMatch?.gaps ?? [] })),
      );

      if (recurringGaps.length === 0) {
        return {
          advised: true,
          recurringGaps: [],
          recommendations: [],
          summary: "No recurring gaps found — your CV is matching the roles you evaluate well.",
        };
      }

      const llm = await generateValidatedObject({
        model,
        schema: careerGrowthLlmPartSchema,
        schemaName: "CareerGrowthPlan",
        system:
          "You are a pragmatic career coach. Given a candidate's recurring fit gaps, propose " +
          "prioritized, concrete growth actions (skills, projects, certifications). Be specific and " +
          "realistic; do not invent the candidate's background.",
        prompt: [
          "Recurring gaps (most frequent first):",
          ...recurringGaps.map((g) => `- ${g.skill} (appeared ${g.frequency}x)`),
          "",
          "Propose prioritized growth actions that would close these gaps, each with a type " +
            "(skill/project/certification/experience), a one-line rationale, and a priority.",
        ].join("\n"),
        telemetry: { functionId: "career-advisor", metadata: { userId } },
      });

      const summary: CareerGrowthSummary = {
        recurringGaps,
        recommendations: llm.recommendations,
        summary: llm.summary,
      };
      const artifact = assertArtifact(
        careerGrowthArtifact,
        careerGrowthArtifact.build(summary),
      );
      return { advised: true, ...artifact.summary };
    } catch (err) {
      console.error(
        "[career-advisor] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { advised: false, error: "Something went wrong while building your growth plan." };
    }
  },
});
