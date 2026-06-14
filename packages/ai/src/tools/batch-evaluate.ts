import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { runEvaluateJob } from "./evaluate-job";
import { BATCH_EVAL_MAX_CONCURRENCY } from "../policy/limits";

/**
 * Batch-evaluate several jobs at once (spec #19). Reuses the keystone `runEvaluateJob` (#3) over a
 * bounded set (cost-capped at BATCH_EVAL_MAX_CONCURRENCY) so the user can rank many roles by fit
 * without clicking each. `userId` + `model` injected server-side.
 */
export const batchEvaluateTool = tool({
  description:
    "Evaluate several jobs at once and rank them by fit — useful after a search to find the best " +
    "matches without evaluating each by hand. Bounded for cost; returns each job's score + band, " +
    "best first. Use when the user says 'score these', 'which of these is the best fit', or 'rank my search'.",
  inputSchema: z.object({
    jobIds: z.array(z.number().int().positive()).min(1).max(25),
    userId: z.string().optional(),
  }),
  execute: async (input) => {
    const { jobIds, userId } = input as { jobIds: number[]; userId?: string };
    const model = (input as { model?: LanguageModel }).model;
    if (!userId) return { evaluated: false, error: "Not authenticated." };
    if (!model) return { evaluated: false, error: "No model available." };

    const capped = jobIds.slice(0, BATCH_EVAL_MAX_CONCURRENCY);
    const skippedOverCap = jobIds.length - capped.length;

    try {
      const results: { jobId: number; score: number; band: string; jobTitle: string }[] = [];
      const failed: { jobId: number; error: string }[] = [];
      for (const jobId of capped) {
        const r = await runEvaluateJob({ jobId, userId, model });
        if (r.evaluated) {
          results.push({ jobId: r.jobId, score: r.score, band: r.band, jobTitle: r.jobTitle });
        } else {
          failed.push({ jobId, error: r.error });
        }
      }
      results.sort((a, b) => b.score - a.score);
      return {
        evaluated: true,
        results,
        failed,
        skippedOverCap,
        cap: BATCH_EVAL_MAX_CONCURRENCY,
      };
    } catch (err) {
      console.error(
        "[batch-evaluate] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { evaluated: false, error: "Something went wrong during batch evaluation." };
    }
  },
});
