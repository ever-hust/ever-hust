import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, jobs, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import {
  negotiationArtifact,
  negotiationDraftSchema,
  type NegotiationSummary,
} from "../structured/schemas/negotiation";
import { assertArtifact, generateValidatedObject } from "../structured";
import { assertNoInvented } from "../policy/assert-no-invented";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Numeric DB columns come back as `string | null`; coerce + guard finiteness. */
function asFiniteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Build a grounded, offer-stage negotiation brief as a structured artifact (spec #15).
 *
 * Produces a market-anchored target range (grounded in the posting salary + the user's stated
 * target — never invented figures), 3–5 leverage points drawn from the candidate's real
 * strengths, 2–3 concise negotiation scripts, and common pitfalls. Runs the #6 no-invent audit
 * over the prose: claims that don't trace to the grounded facts are flagged, not presented as
 * fact. `userId` + `model` injected server-side.
 */
export const negotiationBriefTool = tool({
  description:
    "Build a grounded, offer-stage salary-negotiation brief for a specific job as a structured " +
    "document: a market-anchored target range (from the posting salary + the user's target — no " +
    "invented numbers), leverage points from the user's real strengths, ready-to-send scripts, and " +
    "common pitfalls. Use when the user has (or expects) an offer and wants to negotiate.",
  inputSchema: z.object({
    jobId: z.number().int().positive(),
    currentOffer: z.number().nonnegative().optional(),
    userId: z.string().max(200).optional(),
  }),
  execute: async (input) => {
    const { jobId, currentOffer, userId } = input as {
      jobId: number;
      currentOffer?: number;
      userId?: string;
    };
    const model = (input as { model?: LanguageModel }).model;
    if (!userId) return { briefed: false, jobId, error: "Not authenticated." };
    if (!model) return { briefed: false, jobId, error: "No model available." };

    try {
      const jobRows = await db
        .select({
          title: jobs.title,
          companyName: jobs.companyName,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryInterval: jobs.salaryInterval,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0];
      if (!job) return { briefed: false, jobId, error: `Job ${jobId} not found.` };

      const userRows = await db
        .select({
          name: users.name,
          headline: users.headline,
          skills: users.skills,
          cvParsedData: users.cvParsedData,
          preferences: users.preferences,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const user = userRows[0];
      if (!user) return { briefed: false, jobId, error: "User not found." };

      const cv = (user.cvParsedData ?? {}) as Record<string, unknown>;
      const prefs = (user.preferences ?? {}) as Record<string, unknown>;
      const userSkills = [...asStringArray(user.skills), ...asStringArray(cv.skills)];
      const experience = Array.isArray(cv.experience)
        ? (cv.experience as Record<string, unknown>[]).slice(0, 6).map((e) => {
            const title = typeof e.title === "string" ? e.title : "role";
            const company = typeof e.company === "string" ? e.company : "a company";
            return `${title} at ${company}`;
          })
        : [];

      // Grounded salary facts only — these are the ONLY numbers the model may use.
      const postingMin = asFiniteNumber(job.salaryMin);
      const postingMax = asFiniteNumber(job.salaryMax);
      const targetMin = asFiniteNumber(prefs.salaryMin);
      const targetMax = asFiniteNumber(prefs.salaryMax);
      const interval = typeof job.salaryInterval === "string" ? job.salaryInterval : undefined;

      const salaryFacts: string[] = [];
      if (postingMin !== undefined || postingMax !== undefined) {
        salaryFacts.push(
          `Posting salary: ${postingMin ?? "?"}–${postingMax ?? "?"}${
            interval ? ` per ${interval}` : ""
          }.`,
        );
      }
      if (targetMin !== undefined || targetMax !== undefined) {
        salaryFacts.push(`User salary target: ${targetMin ?? "?"}–${targetMax ?? "?"}.`);
      }
      if (currentOffer !== undefined) {
        salaryFacts.push(`Current offer on the table: ${currentOffer}.`);
      }

      // allowedFacts is the no-invent whitelist: real strengths + the literal salary numbers.
      const allowedFacts = [
        user.name ?? "",
        user.headline ?? "",
        typeof cv.summary === "string" ? cv.summary : "",
        ...userSkills,
        ...experience,
        job.title,
        job.companyName ?? "",
        ...salaryFacts,
        postingMin !== undefined ? String(postingMin) : "",
        postingMax !== undefined ? String(postingMax) : "",
        targetMin !== undefined ? String(targetMin) : "",
        targetMax !== undefined ? String(targetMax) : "",
        currentOffer !== undefined ? String(currentOffer) : "",
      ].filter(Boolean) as string[];

      const draft = await generateValidatedObject({
        model,
        schema: negotiationDraftSchema,
        schemaName: "NegotiationBrief",
        system:
          "You are a calm, candidate-side salary-negotiation coach. Ground every figure in the " +
          "salary facts provided — never invent compensation numbers, market data, employers, " +
          "titles, or percentages. The target range MUST be derived only from the posting salary " +
          "and/or the user's stated target; if no salary data exists, say so honestly in the basis " +
          "and keep the range conservative. Draw leverage points from the candidate's real " +
          "strengths only. Prefer concrete evidence over adjectives. You draft scripts; the user " +
          "sends them — this is not legal advice.",
        prompt: [
          `Candidate: ${user.name ?? "—"}${user.headline ? ` — ${user.headline}` : ""}.`,
          `Candidate skills: ${userSkills.slice(0, 30).join(", ") || "—"}.`,
          `Candidate history: ${experience.join("; ") || "—"}.`,
          `Role: ${job.title} at ${job.companyName ?? "the company"}.`,
          `Salary facts (the ONLY numbers you may use): ${salaryFacts.join(" ") || "none provided"}.`,
          "Write: a one-line summary; a target range (low/high) with the basis cited from the salary " +
            "facts above; 3–5 leverage points from the candidate's real strengths; 2–3 concise " +
            "scripts (counter, competing_offer, non_comp_ask as applicable); and common pitfalls.",
        ].join("\n"),
        telemetry: { functionId: "negotiation-brief", metadata: { userId, jobId } },
      });

      // Audit the prose the model wrote (not the structured numbers) for ungrounded claims.
      const auditText = [
        draft.summary,
        draft.targetRange.basis,
        ...draft.leveragePoints,
        ...draft.scripts.map((s) => s.script),
        ...draft.pitfalls,
      ].join("\n");
      const audit = assertNoInvented({ text: auditText, allowedFacts });

      const summary: NegotiationSummary = {
        jobId,
        summary: draft.summary,
        targetRange: draft.targetRange,
        leveragePoints: draft.leveragePoints,
        scripts: draft.scripts,
        pitfalls: draft.pitfalls,
        grounded: audit.grounded,
        flaggedClaims: audit.flaggedClaims,
      };
      const artifact = assertArtifact(negotiationArtifact, negotiationArtifact.build(summary));
      return { briefed: true, ...artifact.summary };
    } catch (err) {
      console.error(
        "[negotiation-brief] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return { briefed: false, jobId, error: "Something went wrong while building the brief." };
    }
  },
});
