import { z } from "zod";
import { defineArtifact } from "../contract";

/** Interview prep + STAR story bank artifact (spec #12), on the #5 contract. */
export const INTERVIEW_PREP_SCHEMA_VERSION = 1;

export const interviewThemeSchema = z.object({
  theme: z.string().min(1).max(200),
  why: z.string().min(1).max(600),
});

export const starStorySchema = z.object({
  theme: z.string().min(1).max(200),
  situation: z.string().min(1).max(1000),
  task: z.string().min(1).max(800),
  action: z.string().min(1).max(1200),
  result: z.string().min(1).max(800),
});

/** The part the LLM produces (grounded in the user's real experience). */
export const interviewPrepDraftSchema = z.object({
  themes: z.array(interviewThemeSchema).min(1).max(10),
  starStories: z.array(starStorySchema).min(1).max(8),
  questionsToAsk: z.array(z.string().max(300)).max(10),
});

export const interviewPrepSummarySchema = interviewPrepDraftSchema.extend({
  jobId: z.number().int().positive(),
  grounded: z.boolean(),
  flaggedClaims: z.array(z.string().max(300)).max(40),
});

export type InterviewPrepDraft = z.infer<typeof interviewPrepDraftSchema>;
export type InterviewPrepSummary = z.infer<typeof interviewPrepSummarySchema>;

export const interviewPrepArtifact = defineArtifact(
  "interview_prep",
  INTERVIEW_PREP_SCHEMA_VERSION,
  interviewPrepSummarySchema,
);
