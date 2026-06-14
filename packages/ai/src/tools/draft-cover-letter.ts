import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, jobs, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import {
  coverLetterArtifact,
  coverLetterDraftSchema,
  assertArtifact,
  generateValidatedObject,
  type CoverLetterSummary,
} from "../structured";
import { assertNoInvented } from "../policy/assert-no-invented";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Draft a complete, grounded cover letter as a structured artifact (spec #10).
 *
 * Unlike the lighter `generateCoverLetter` (which returns context for the chat to narrate), this
 * produces the finished letter as a #5 artifact and runs the #6 no-invent audit: the body is
 * checked against the grounded facts (the user's real CV/profile + the job), and any ungrounded
 * claim is flagged rather than silently presented as fact. `userId` + `model` injected server-side.
 */
export const draftCoverLetterTool = tool({
  description:
    "Draft a complete, tailored cover letter for a specific job as a structured document, grounded " +
    "in the user's real CV/profile (no invented facts — ungrounded claims are flagged). Use when the " +
    "user wants an actual finished cover letter (not just talking points).",
  inputSchema: z.object({
    jobId: z.number().int().positive(),
    tone: z
      .enum(["professional", "conversational", "enthusiastic", "concise"])
      .optional()
      .default("professional"),
    userId: z.string().optional(),
  }),
  execute: async (input) => {
    const { jobId, tone = "professional", userId } = input as {
      jobId: number;
      tone?: "professional" | "conversational" | "enthusiastic" | "concise";
      userId?: string;
    };
    const model = (input as { model?: LanguageModel }).model;
    if (!userId) return { drafted: false, jobId, error: "Not authenticated." };
    if (!model) return { drafted: false, jobId, error: "No model available." };

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
      if (!job) return { drafted: false, jobId, error: `Job ${jobId} not found.` };

      const userRows = await db
        .select({
          name: users.name,
          headline: users.headline,
          skills: users.skills,
          cvParsedData: users.cvParsedData,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const user = userRows[0];
      if (!user) return { drafted: false, jobId, error: "User not found." };

      const cv = (user.cvParsedData ?? {}) as Record<string, unknown>;
      const userSkills = [...asStringArray(user.skills), ...asStringArray(cv.skills)];
      const experience = Array.isArray(cv.experience)
        ? (cv.experience as Record<string, unknown>[]).slice(0, 6).map((e) => {
            const title = typeof e.title === "string" ? e.title : "role";
            const company = typeof e.company === "string" ? e.company : "a company";
            return `${title} at ${company}`;
          })
        : [];

      const allowedFacts = [
        user.name ?? "",
        user.headline ?? "",
        typeof cv.summary === "string" ? cv.summary : "",
        ...userSkills,
        ...experience,
        job.title,
        job.companyName ?? "",
      ].filter(Boolean) as string[];

      const draft = await generateValidatedObject({
        model,
        schema: coverLetterDraftSchema,
        schemaName: "CoverLetter",
        system:
          "You write concise, specific cover letters. Ground every claim in the candidate's real " +
          "profile/CV facts provided — never invent employers, titles, dates, or numbers. Prefer " +
          "concrete evidence over adjectives.",
        prompt: [
          `Tone: ${tone}.`,
          `Candidate: ${user.name ?? "—"}${user.headline ? ` — ${user.headline}` : ""}.`,
          `Candidate skills: ${userSkills.slice(0, 30).join(", ") || "—"}.`,
          `Candidate history: ${experience.join("; ") || "—"}.`,
          `Job: ${job.title} at ${job.companyName ?? "the company"}.`,
          `Job needs: ${asStringArray(job.skills).join(", ") || "—"}.`,
          `Job description (excerpt): ${(job.description ?? "").slice(0, 2000)}`,
          "Write greeting, body (2–3 short paragraphs), and closing. List the matched skills you leaned on.",
        ].join("\n"),
        telemetry: { functionId: "draft-cover-letter", metadata: { userId, jobId } },
      });

      const audit = assertNoInvented({ text: draft.body, allowedFacts });

      const summary: CoverLetterSummary = {
        jobId,
        tone,
        greeting: draft.greeting,
        body: draft.body,
        closing: draft.closing,
        highlightedSkills: draft.highlightedSkills,
        grounded: audit.grounded,
        flaggedClaims: audit.flaggedClaims,
      };
      const artifact = assertArtifact(coverLetterArtifact, coverLetterArtifact.build(summary));
      return { drafted: true, ...artifact.summary };
    } catch (err) {
      console.error(
        "[draft-cover-letter] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { drafted: false, jobId, error: "Something went wrong while drafting the letter." };
    }
  },
});
