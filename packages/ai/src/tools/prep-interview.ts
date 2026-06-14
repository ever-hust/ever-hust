import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, jobs, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import {
  interviewPrepArtifact,
  interviewPrepDraftSchema,
  type InterviewPrepSummary,
} from "../structured/schemas/interview-prep";
import { assertArtifact, generateValidatedObject } from "../structured";
import { assertNoInvented } from "../policy/assert-no-invented";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Build a structured interview prep kit + STAR story bank (spec #12), grounded in the user's real
 * experience. The STAR stories are seeded from actual CV history — assertNoInvented (#6) flags any
 * fabricated detail. `userId` + `model` injected server-side.
 */
export const prepInterviewTool = tool({
  description:
    "Build a structured interview prep kit for a specific job: likely themes, a STAR story bank " +
    "(situation/task/action/result) seeded from the user's REAL experience, and smart questions to " +
    "ask. Use when the user is interviewing and wants to prepare. Differs from interviewPrep (which " +
    "returns lighter coaching context) by producing a persisted, grounded structured kit.",
  inputSchema: z.object({
    jobId: z.number().int().positive(),
    userId: z.string().optional(),
  }),
  execute: async (input) => {
    const { jobId, userId } = input as { jobId: number; userId?: string };
    const model = (input as { model?: LanguageModel }).model;
    if (!userId) return { prepped: false, jobId, error: "Not authenticated." };
    if (!model) return { prepped: false, jobId, error: "No model available." };

    try {
      const jobRows = await db
        .select({
          title: jobs.title,
          companyName: jobs.companyName,
          description: jobs.description,
          skills: jobs.skills,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0];
      if (!job) return { prepped: false, jobId, error: `Job ${jobId} not found.` };

      const userRows = await db
        .select({ skills: users.skills, cvParsedData: users.cvParsedData })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const user = userRows[0];
      if (!user) return { prepped: false, jobId, error: "User not found." };

      const cv = (user.cvParsedData ?? {}) as Record<string, unknown>;
      const userSkills = [...asStringArray(user.skills), ...asStringArray(cv.skills)];
      const experience = Array.isArray(cv.experience)
        ? (cv.experience as Record<string, unknown>[]).slice(0, 8).map((e) => {
            const title = typeof e.title === "string" ? e.title : "role";
            const company = typeof e.company === "string" ? e.company : "a company";
            return `${title} at ${company}`;
          })
        : [];

      const allowedFacts = [
        typeof cv.summary === "string" ? cv.summary : "",
        ...userSkills,
        ...experience,
        job.title,
        job.companyName ?? "",
      ].filter(Boolean) as string[];

      const draft = await generateValidatedObject({
        model,
        schema: interviewPrepDraftSchema,
        schemaName: "InterviewPrep",
        system:
          "You are an interview coach. Produce likely interview themes, a STAR story bank seeded " +
          "ONLY from the candidate's real experience (never invent employers, projects, or numbers), " +
          "and smart questions for the candidate to ask. If evidence is thin, keep stories general " +
          "rather than fabricating specifics.",
        prompt: [
          `Job: ${job.title} at ${job.companyName ?? "the company"}.`,
          `Job needs: ${asStringArray(job.skills).join(", ") || "—"}.`,
          `Job description (excerpt): ${(job.description ?? "").slice(0, 2000)}`,
          `Candidate skills: ${userSkills.slice(0, 30).join(", ") || "—"}.`,
          `Candidate history: ${experience.join("; ") || "—"}.`,
          "Produce themes (with why each matters), 3–6 STAR stories from the candidate's real history, and questions to ask.",
        ].join("\n"),
        telemetry: { functionId: "prep-interview", metadata: { userId, jobId } },
      });

      const proseToAudit = draft.starStories
        .map((s) => `${s.situation} ${s.task} ${s.action} ${s.result}`)
        .join(" ");
      const audit = assertNoInvented({ text: proseToAudit, allowedFacts });

      const summary: InterviewPrepSummary = {
        jobId,
        themes: draft.themes,
        starStories: draft.starStories,
        questionsToAsk: draft.questionsToAsk,
        grounded: audit.grounded,
        flaggedClaims: audit.flaggedClaims,
      };
      const artifact = assertArtifact(interviewPrepArtifact, interviewPrepArtifact.build(summary));
      return { prepped: true, ...artifact.summary };
    } catch (err) {
      console.error(
        "[prep-interview] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { prepped: false, jobId, error: "Something went wrong while building your prep kit." };
    }
  },
});
