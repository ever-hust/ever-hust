import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, jobs, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { assertArtifact, generateValidatedObject } from "../structured";
import {
  outreachArtifact,
  outreachDraftSchema,
  type OutreachSummary,
} from "../structured/schemas/outreach";
import { assertNoInvented } from "../policy/assert-no-invented";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const CONTACT_LABEL: Record<"recruiter" | "hiring_manager" | "referral", string> = {
  recruiter: "the recruiter for this role",
  hiring_manager: "the hiring manager for this role",
  referral: "a potential referral / connection inside the company",
};

/**
 * Draft a short, grounded recruiter / networking outreach message as a structured artifact (spec #17).
 *
 * DRAFT ONLY — Hust never sends, connects, or messages on the user's behalf (HITL, spec #6). This
 * produces a 3-sentence framework (hook → credibility → ask) as a #5 artifact and runs the #6
 * no-invent audit: the message is checked against the grounded facts (the user's real CV/profile +
 * the role), and any ungrounded claim is flagged rather than silently presented as fact. The user
 * copies it and sends it themselves. `userId` + `model` injected server-side.
 */
export const draftOutreachTool = tool({
  description:
    "Draft a short, tailored outreach message (3-sentence framework: hook → credibility → ask) to a " +
    "recruiter, hiring manager, or potential referral for a specific job, grounded in the user's real " +
    "CV/profile (no invented facts — ungrounded claims are flagged). DRAFT ONLY: Hust never sends or " +
    "connects on the user's behalf — the user copies and sends it themselves. Use when the user wants " +
    "a ready-to-send outreach note for networking on a role.",
  inputSchema: z.object({
    jobId: z.number().int().positive(),
    contactType: z.enum(["recruiter", "hiring_manager", "referral"]),
    userId: z.string().max(255).optional(),
  }),
  execute: async (input) => {
    const { jobId, contactType, userId } = input as {
      jobId: number;
      contactType: "recruiter" | "hiring_manager" | "referral";
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
        schema: outreachDraftSchema,
        schemaName: "Outreach",
        system:
          "You write short, specific, human outreach messages for professional networking (e.g. a " +
          "professional-network connection note or recruiter follow-up). Use a 3-sentence framework: hook " +
          "(why you're reaching out, anchored to the role/company), credibility (the candidate's " +
          "real, grounded background that fits), ask (one small, specific, low-friction request). " +
          "Ground every claim in the candidate's real profile/CV facts provided — never invent " +
          "employers, titles, dates, or numbers. Keep it concise and warm, not salesy.",
        prompt: [
          `Reaching out to: ${CONTACT_LABEL[contactType]}.`,
          `Candidate: ${user.name ?? "—"}${user.headline ? ` — ${user.headline}` : ""}.`,
          `Candidate skills: ${userSkills.slice(0, 30).join(", ") || "—"}.`,
          `Candidate history: ${experience.join("; ") || "—"}.`,
          `Role: ${job.title} at ${job.companyName ?? "the company"}.`,
          "Write the hook, credibility, and ask sentences, then the assembled message (the three " +
            "sentences joined). List the grounded background points you leaned on.",
        ].join("\n"),
        telemetry: { functionId: "draft-outreach", metadata: { userId, jobId } },
      });

      const audit = assertNoInvented({ text: draft.message, allowedFacts });

      const summary: OutreachSummary = {
        jobId,
        contactType,
        hook: draft.hook,
        credibility: draft.credibility,
        ask: draft.ask,
        message: draft.message,
        highlightedBackground: draft.highlightedBackground,
        grounded: audit.grounded,
        flaggedClaims: audit.flaggedClaims,
      };
      const artifact = assertArtifact(outreachArtifact, outreachArtifact.build(summary));
      return {
        drafted: true,
        ...artifact.summary,
        note: "This is a draft for you to send yourself — Hust never sends or connects on your behalf.",
      };
    } catch (err) {
      console.error(
        "[draft-outreach] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { drafted: false, jobId, error: "Something went wrong while drafting the outreach message." };
    }
  },
});
