import { z } from "zod";
import { defineArtifact } from "../contract";

/** Tailored-resume machine summary (spec #11), built on the #5 structured-output contract. */
export const RESUME_SCHEMA_VERSION = 1;

/** The part the LLM produces (grounded prose + structured suggestions). */
export const resumeDraftSchema = z.object({
  /** A rewritten professional summary, tailored to the target role. */
  professionalSummary: z.string().min(1).max(3000),
  /** 3–6 achievement-oriented bullet suggestions, grounded in real CV experience. */
  bulletSuggestions: z.array(z.string().min(1).max(500)).min(3).max(6),
  /** JD keywords the resume should align with for ATS matching. */
  keywordsToAlign: z.array(z.string().max(100)).max(30),
  /** ATS-formatting tips (single-column, standard headings, no tables, etc.). */
  atsTips: z.array(z.string().max(300)).max(12),
});

export const resumeSummarySchema = resumeDraftSchema.extend({
  jobId: z.number().int().positive(),
  /** No-invent audit (spec #6): true when the prose cites only grounded CV facts. */
  grounded: z.boolean(),
  flaggedClaims: z.array(z.string().max(300)).max(40),
});

export type ResumeDraft = z.infer<typeof resumeDraftSchema>;
export type ResumeSummary = z.infer<typeof resumeSummarySchema>;

export const resumeArtifact = defineArtifact(
  "resume",
  RESUME_SCHEMA_VERSION,
  resumeSummarySchema,
);
