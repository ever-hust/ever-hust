import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, jobs, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import {
  resumeArtifact,
  resumeDraftSchema,
  type ResumeSummary,
} from "../structured/schemas/resume";
import { assertArtifact, generateValidatedObject } from "../structured";
import { assertNoInvented } from "../policy/assert-no-invented";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Tailor the user's résumé for a specific job as a structured artifact (spec #11).
 *
 * Produces a finished, grounded advisory artifact: a rewritten professional summary, 3–6
 * achievement-oriented bullet suggestions, the JD keywords to align with, and ATS-formatting
 * tips. Runs the #6 no-invent audit — the generated prose is checked against the candidate's
 * real CV facts (skills + experience), and any ungrounded claim (invented employers, titles,
 * dates, or numbers) is flagged rather than silently presented as fact. `userId` + `model`
 * injected server-side.
 */
export const tailorResumeTool = tool({
  description:
    "Tailor the user's résumé for a specific job as a structured document, grounded in their real " +
    "CV/profile (no invented facts — ungrounded claims are flagged). Returns a rewritten " +
    "professional summary, achievement-oriented bullet suggestions, the job-description keywords " +
    "to align with, and ATS formatting tips. Use when the user wants their résumé tailored to a role.",
  inputSchema: z.object({
    jobId: z.number().int().positive(),
    userId: z.string().optional(),
  }),
  execute: async (input) => {
    const { jobId, userId } = input as { jobId: number; userId?: string };
    const model = (input as { model?: LanguageModel }).model;
    if (!userId) return { tailored: false, jobId, error: "Not authenticated." };
    if (!model) return { tailored: false, jobId, error: "No model available." };

    try {
      const jobRows = await db
        .select({
          title: jobs.title,
          description: jobs.description,
          skills: jobs.skills,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0];
      if (!job) return { tailored: false, jobId, error: `Job ${jobId} not found.` };

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
      if (!user) return { tailored: false, jobId, error: "User not found." };

      const cv = (user.cvParsedData ?? {}) as Record<string, unknown>;
      const userSkills = [...asStringArray(user.skills), ...asStringArray(cv.skills)];
      const experience = Array.isArray(cv.experience)
        ? (cv.experience as Record<string, unknown>[]).slice(0, 8).map((e) => {
            const title = typeof e.title === "string" ? e.title : "role";
            const company = typeof e.company === "string" ? e.company : "a company";
            const summary = typeof e.summary === "string" ? ` — ${e.summary}` : "";
            return `${title} at ${company}${summary}`;
          })
        : [];

      const jobSkills = asStringArray(job.skills);

      const allowedFacts = [
        user.name ?? "",
        user.headline ?? "",
        typeof cv.summary === "string" ? cv.summary : "",
        ...userSkills,
        ...experience,
        job.title,
      ].filter(Boolean) as string[];

      const draft = await generateValidatedObject({
        model,
        schema: resumeDraftSchema,
        schemaName: "Resume",
        system:
          "You tailor résumés. Ground every claim in the candidate's real CV facts provided — never " +
          "invent employers, titles, dates, or numbers. Rewrite the professional summary and propose " +
          "achievement-oriented bullets that quantify real impact only where the source supports it. " +
          "Prefer concrete evidence over adjectives.",
        prompt: [
          `Candidate: ${user.name ?? "—"}${user.headline ? ` — ${user.headline}` : ""}.`,
          `Candidate skills: ${userSkills.slice(0, 30).join(", ") || "—"}.`,
          `Candidate experience: ${experience.join("; ") || "—"}.`,
          `Candidate CV summary: ${typeof cv.summary === "string" ? cv.summary.slice(0, 1000) : "—"}.`,
          `Target job: ${job.title}.`,
          `Job needs (skills): ${jobSkills.join(", ") || "—"}.`,
          `Job description (excerpt): ${(job.description ?? "").slice(0, 2000)}`,
          "Write a tailored professionalSummary, 3–6 achievement-oriented bulletSuggestions grounded in " +
            "the real experience above, the keywordsToAlign drawn from the job needs, and ATS formatting tips.",
        ].join("\n"),
        telemetry: { functionId: "tailor-resume", metadata: { userId, jobId } },
      });

      const auditText = [draft.professionalSummary, ...draft.bulletSuggestions].join("\n");
      const audit = assertNoInvented({ text: auditText, allowedFacts });

      const summary: ResumeSummary = {
        jobId,
        professionalSummary: draft.professionalSummary,
        bulletSuggestions: draft.bulletSuggestions,
        keywordsToAlign: draft.keywordsToAlign,
        atsTips: draft.atsTips,
        grounded: audit.grounded,
        flaggedClaims: audit.flaggedClaims,
      };
      const artifact = assertArtifact(resumeArtifact, resumeArtifact.build(summary));
      return { tailored: true, ...artifact.summary };
    } catch (err) {
      console.error(
        "[tailor-resume] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { tailored: false, jobId, error: "Something went wrong while tailoring the résumé." };
    }
  },
});
