import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, jobs, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import {
  applyDraftArtifact,
  applyDraftLlmPartSchema,
  type ApplyDraftSummary,
} from "../structured/schemas/apply-draft";
import { assertArtifact, generateValidatedObject } from "../structured";
import { assertNoInvented } from "../policy/assert-no-invented";
import { createApprovalGate } from "../policy/require-approval";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Apply Copilot (spec #19a) — the honest, ToS-respecting form of "AI applies for you". It drafts
 * EVERY field of an application (proposal + screening Q&A + suggested terms) grounded in the user's
 * real profile, runs the #6 no-invent audit, and opens an **approval gate** (#6). It NEVER submits:
 * a human must approve, and the actual submission (the optional Gauzy seam) stays approval-gated.
 * `userId` + `model` injected server-side.
 */
export const applyCopilotTool = tool({
  description:
    "Draft a complete, review-ready job application (proposal, screening Q&A, suggested terms) " +
    "grounded in the user's real profile, then open an approval gate. NEVER submits — the user must " +
    "review and approve, then submit themselves. Use when the user wants help actually applying.",
  inputSchema: z.object({
    jobId: z.number().int().positive(),
    userId: z.string().optional(),
  }),
  execute: async (input) => {
    const { jobId, userId } = input as { jobId: number; userId?: string };
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
        .select({ name: users.name, headline: users.headline, skills: users.skills, cvParsedData: users.cvParsedData })
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
        schema: applyDraftLlmPartSchema,
        schemaName: "ApplyDraft",
        system:
          "You assemble a complete, review-ready job application from the candidate's REAL profile. " +
          "Write a tailored proposal, anticipate likely screening questions with grounded answers, " +
          "and suggest terms only if salary context is given. Never invent experience, employers, or " +
          "numbers — if unknown, leave a clearly marked placeholder for the user to fill.",
        prompt: [
          `Job: ${job.title} at ${job.companyName ?? "the company"}.`,
          `Job needs: ${asStringArray(job.skills).join(", ") || "—"}.`,
          `Job description (excerpt): ${(job.description ?? "").slice(0, 2000)}`,
          `Candidate: ${user.name ?? "—"}${user.headline ? ` — ${user.headline}` : ""}.`,
          `Candidate skills: ${userSkills.slice(0, 30).join(", ") || "—"}.`,
          `Candidate history: ${experience.join("; ") || "—"}.`,
          "Draft the proposal, screening Q&A, and (optional) suggested terms.",
        ].join("\n"),
        telemetry: { functionId: "apply-copilot", metadata: { userId, jobId } },
      });

      const proseToAudit = [draft.proposal, ...draft.screeningQA.map((q) => q.answer)].join(" ");
      const audit = assertNoInvented({ text: proseToAudit, allowedFacts });

      const summary: ApplyDraftSummary = {
        jobId,
        proposal: draft.proposal,
        screeningQA: draft.screeningQA,
        ...(draft.suggestedTerms ? { suggestedTerms: draft.suggestedTerms } : {}),
        grounded: audit.grounded,
        flaggedClaims: audit.flaggedClaims,
      };
      const artifact = assertArtifact(applyDraftArtifact, applyDraftArtifact.build(summary));

      // Open the structural approval gate (#6). Submission NEVER happens here.
      const gate = await createApprovalGate({
        userId,
        tool: "applyCopilotSubmit",
        actionId: `apply:${jobId}`,
        summary: { jobId, jobTitle: job.title, companyName: job.companyName },
      });

      return {
        drafted: true,
        needsApproval: true,
        gateId: gate.gateId,
        ...artifact.summary,
      };
    } catch (err) {
      console.error(
        "[apply-copilot] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { drafted: false, jobId, error: "Something went wrong while assembling the application." };
    }
  },
});
