import { z } from "zod";
import { defineArtifact } from "../contract";

/** Deep company-research machine summary (spec #16), built on the #5 structured-output contract. */
export const COMPANY_RESEARCH_SCHEMA_VERSION = 1;

/** The part the LLM produces (grounded prose + advisory lists). */
export const companyResearchDraftSchema = z.object({
  /** One-paragraph plain summary of what the company does, drawn from the company description. */
  overview: z.string().min(1).max(2000),
  /** Smart, specific questions the candidate can ask in interviews. */
  smartQuestions: z.array(z.string().max(300)).max(15),
  /** Balanced positives a candidate can reasonably read from the grounded data. */
  greenFlags: z.array(z.string().max(300)).max(15),
  /** Things to independently verify before applying/accepting (the honest counterweight). */
  thingsToVerify: z.array(z.string().max(300)).max(15),
});

export const companyResearchSummarySchema = companyResearchDraftSchema.extend({
  jobId: z.number().int().positive(),
  companyName: z.string().max(200),
  industry: z.string().max(200).nullable(),
  /** Headcount band as reported on the listing (free text, e.g. "201-500"). */
  size: z.string().max(200).nullable(),
  /** Open roles for this company observed in the Ever Jobs corpus. */
  openRolesInCorpus: z.number().int().nonnegative(),
  /** No-invent audit (spec #6): true when the overview cites only grounded facts. */
  grounded: z.boolean(),
  flaggedClaims: z.array(z.string().max(300)).max(40),
});

export type CompanyResearchDraft = z.infer<typeof companyResearchDraftSchema>;
export type CompanyResearchSummary = z.infer<typeof companyResearchSummarySchema>;

export const companyResearchArtifact = defineArtifact(
  "company_research",
  COMPANY_RESEARCH_SCHEMA_VERSION,
  companyResearchSummarySchema,
);
