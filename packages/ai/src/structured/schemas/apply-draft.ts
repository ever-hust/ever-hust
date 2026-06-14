import { z } from "zod";
import { defineArtifact } from "../contract";

/** Apply-copilot draft artifact (spec #19a), on the #5 contract. HITL — never auto-submitted. */
export const APPLY_DRAFT_SCHEMA_VERSION = 1;

export const screeningQAItemSchema = z.object({
  question: z.string().min(1).max(600),
  answer: z.string().min(1).max(3000),
});

/** The part the LLM produces (grounded). */
export const applyDraftLlmPartSchema = z.object({
  proposal: z.string().min(1).max(6000),
  screeningQA: z.array(screeningQAItemSchema).max(20),
  suggestedTerms: z.string().max(1000).optional(),
});

export const applyDraftSummarySchema = applyDraftLlmPartSchema.extend({
  jobId: z.number().int().positive(),
  grounded: z.boolean(),
  flaggedClaims: z.array(z.string().max(300)).max(40),
});

export type ApplyDraftLlmPart = z.infer<typeof applyDraftLlmPartSchema>;
export type ApplyDraftSummary = z.infer<typeof applyDraftSummarySchema>;

export const applyDraftArtifact = defineArtifact(
  "apply_draft",
  APPLY_DRAFT_SCHEMA_VERSION,
  applyDraftSummarySchema,
);
