import { z } from "zod";
import { defineArtifact } from "../contract";

/** Cover-letter machine summary (spec #10), built on the #5 structured-output contract. */
export const COVER_LETTER_SCHEMA_VERSION = 1;

/** The part the LLM produces (grounded prose). */
export const coverLetterDraftSchema = z.object({
  greeting: z.string().min(1).max(200),
  body: z.string().min(1).max(6000),
  closing: z.string().min(1).max(300),
  highlightedSkills: z.array(z.string().max(100)).max(20),
});

export const coverLetterSummarySchema = coverLetterDraftSchema.extend({
  jobId: z.number().int().positive(),
  tone: z.enum(["professional", "conversational", "enthusiastic", "concise"]),
  /** No-invent audit (spec #6): true when the body cites only grounded facts. */
  grounded: z.boolean(),
  flaggedClaims: z.array(z.string().max(300)).max(40),
});

export type CoverLetterDraft = z.infer<typeof coverLetterDraftSchema>;
export type CoverLetterSummary = z.infer<typeof coverLetterSummarySchema>;

export const coverLetterArtifact = defineArtifact(
  "cover_letter",
  COVER_LETTER_SCHEMA_VERSION,
  coverLetterSummarySchema,
);
