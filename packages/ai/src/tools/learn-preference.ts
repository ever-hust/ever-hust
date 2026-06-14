import { tool } from "ai";
import { z } from "zod";
import { db, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { DEFAULT_DIMENSIONS } from "../evaluation/scoring";
import { reconcileWeights } from "../learning/reconcile";

const KNOWN_DIMENSIONS = new Set(DEFAULT_DIMENSIONS.map((d) => d.key));

/**
 * Learning loop (spec #13): persist the user's stated priorities as their Layer-2 override of
 * the evaluation weights. These persist in `users.preferences.evaluationWeights` and are read by
 * the evaluation engine's weight merge (spec #3, `resolveWeights`) — so future fit scores reflect
 * what the user actually cares about. User overrides always win and are never clobbered by system
 * defaults. `userId` injected server-side.
 */
export const learnPreferenceTool = tool({
  description:
    "Persist how much each evaluation dimension matters to the user (e.g. 'I care more about comp " +
    "and remote, less about brand reputation'). Adjusts their evaluation weights so future job-fit " +
    "scores reflect their priorities. Known dimensions: north_star, cv_match, level, comp, growth, " +
    "remote, reputation, tech, speed, culture. Use when the user tells you what matters to them.",
  inputSchema: z.object({
    adjustments: z
      .record(z.string(), z.number().min(0).max(100))
      .describe("dimension key → weight percentage, e.g. { comp: 25, remote: 15 }"),
    userId: z.string().optional(),
  }),
  execute: async ({ adjustments, userId }) => {
    if (!userId) return { updated: false, error: "Not authenticated." };
    const valid = Object.fromEntries(
      Object.entries(adjustments).filter(([key]) => KNOWN_DIMENSIONS.has(key)),
    );
    if (Object.keys(valid).length === 0) {
      return {
        updated: false,
        error: "No known evaluation dimensions in the adjustment.",
      };
    }
    try {
      const rows = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (rows.length === 0) return { updated: false, error: "User not found." };

      const prefs = (rows[0]!.preferences ?? {}) as Record<string, unknown>;
      const current = (prefs.evaluationWeights ?? {}) as Record<string, number>;
      const evaluationWeights = reconcileWeights(current, valid);
      const newPrefs = { ...prefs, evaluationWeights };

      await db
        .update(users)
        .set({ preferences: newPrefs, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return { updated: true, evaluationWeights };
    } catch (err) {
      console.error(
        "[learn-preference] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return {
        updated: false,
        error: "Something went wrong while saving your preferences.",
      };
    }
  },
});
