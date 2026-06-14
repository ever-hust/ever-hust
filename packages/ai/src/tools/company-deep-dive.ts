import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, jobs } from "@ever-hust/db";
import { eq, ilike, sql } from "drizzle-orm";
import { escapeIlike } from "@ever-hust/db";
import {
  companyResearchArtifact,
  companyResearchDraftSchema,
  type CompanyResearchSummary,
} from "../structured/schemas/company-research";
import { assertArtifact, generateValidatedObject } from "../structured";
import { assertNoInvented } from "../policy/assert-no-invented";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Produce a grounded, structured company brief for a specific job (spec #16).
 *
 * Unlike the lighter `companyResearch` (which returns raw corpus facts for the chat to narrate),
 * this assembles a finished company brief as a #5 artifact and runs the #6 no-invent audit: the
 * overview is checked against the grounded facts (the listing's own company fields + the open-roles
 * count from the Ever Jobs corpus), and any ungrounded claim is flagged rather than presented as
 * fact. It never fabricates firmographics. `userId` + `model` injected server-side.
 */
export const companyDeepDiveTool = tool({
  description:
    "Build a grounded company brief for a specific job: what the company does, its size/industry, " +
    "how many open roles it has in our corpus, smart interview questions, and balanced green-flags " +
    "vs things-to-verify. Grounded in our job corpus — no invented facts (ungrounded claims are " +
    "flagged). Use when the user wants to research the employer behind a job before applying.",
  inputSchema: z.object({
    jobId: z.number().int().positive(),
    userId: z.string().optional(),
  }),
  execute: async (input) => {
    const { jobId, userId } = input as { jobId: number; userId?: string };
    const model = (input as { model?: LanguageModel }).model;
    if (!userId) return { researched: false, jobId, error: "Not authenticated." };
    if (!model) return { researched: false, jobId, error: "No model available." };

    try {
      const jobRows = await db
        .select({
          title: jobs.title,
          companyName: jobs.companyName,
          companyIndustry: jobs.companyIndustry,
          companyNumEmployees: jobs.companyNumEmployees,
          companyDescription: jobs.companyDescription,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0];
      if (!job) return { researched: false, jobId, error: `Job ${jobId} not found.` };

      const companyName = job.companyName;
      if (!companyName) {
        return { researched: false, jobId, error: "This job has no company on record." };
      }

      // Aggregate corpus signal: how many open roles this company has in our database.
      const pattern = `%${escapeIlike(companyName)}%`;
      const countRows = await db
        .select({ value: sql<number>`count(*)` })
        .from(jobs)
        .where(ilike(jobs.companyName, pattern));
      const rawCount = Number(countRows[0]?.value ?? 0);
      const openRolesInCorpus = Number.isFinite(rawCount) && rawCount >= 0 ? rawCount : 0;

      const industry = job.companyIndustry ?? null;
      const size = job.companyNumEmployees ?? null;
      const description = (job.companyDescription ?? "").slice(0, 4000);

      const allowedFacts = [
        companyName,
        industry ?? "",
        size ?? "",
        job.title ?? "",
        description,
        String(openRolesInCorpus),
      ].filter(Boolean) as string[];

      const draft = await generateValidatedObject({
        model,
        schema: companyResearchDraftSchema,
        schemaName: "CompanyResearch",
        system:
          "You write grounded, balanced company briefs for a job candidate. Ground every claim in " +
          "the company facts provided — never invent funding, headcount, revenue, ratings, tech " +
          "stack, or news that isn't in the supplied data. Be honest: pair genuine positives with " +
          "things the candidate should independently verify. Prefer concrete evidence over hype.",
        prompt: [
          `Company: ${companyName}.`,
          `Industry: ${industry ?? "—"}.`,
          `Reported size: ${size ?? "—"}.`,
          `Open roles for this company in our corpus: ${openRolesInCorpus}.`,
          `This job: ${job.title ?? "—"}.`,
          `Company description (excerpt): ${description || "—"}`,
          "Write: an overview of what the company does (from the description only); 4-8 smart, " +
            "specific interview questions; balanced green-flags the data supports; and things to " +
            "verify before applying. Do not state facts not present above.",
        ].join("\n"),
        telemetry: { functionId: "company-deep-dive", metadata: { userId, jobId } },
      });

      const audit = assertNoInvented({ text: draft.overview, allowedFacts });

      const summary: CompanyResearchSummary = {
        jobId,
        companyName,
        industry,
        size,
        openRolesInCorpus,
        overview: draft.overview,
        smartQuestions: asStringArray(draft.smartQuestions),
        greenFlags: asStringArray(draft.greenFlags),
        thingsToVerify: asStringArray(draft.thingsToVerify),
        grounded: audit.grounded,
        flaggedClaims: audit.flaggedClaims,
      };
      const artifact = assertArtifact(companyResearchArtifact, companyResearchArtifact.build(summary));
      return { researched: true, ...artifact.summary };
    } catch (err) {
      console.error(
        "[company-deep-dive] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { researched: false, jobId, error: "Something went wrong while researching the company." };
    }
  },
});
