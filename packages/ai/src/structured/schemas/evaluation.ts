import { z } from "zod";
import { defineArtifact } from "../contract";

/**
 * Machine-summary schema for the `evaluation` artifact (spec #3 §4.1, contract #5).
 *
 * NOTE on `jobId`: the spec's §4 draft typed it as `z.string().uuid()`, but the real
 * `jobs` table uses an integer identity PK (`generatedAlwaysAsIdentity`). We follow the
 * codebase: `jobId` is a positive integer. (Recorded as a decision in spec #3 §10.)
 */
export const EVALUATION_SCHEMA_VERSION = 1;

export const evaluationBandSchema = z.enum([
  "apply_now",
  "worth_it",
  "specific_reason",
  "not_recommended",
]);

export const dimensionSourceSchema = z.enum(["deterministic", "llm"]);

export const evaluationDimensionSchema = z.object({
  key: z.string().min(1).max(60),
  weight: z.number().min(0).max(100),
  score5: z.number().min(1).max(5),
  rationale: z.string().min(1).max(2000),
  source: dimensionSourceSchema,
});

export const cvMatchEvidenceSchema = z.object({
  requirement: z.string().min(1).max(500),
  cvEvidence: z.string().max(1000),
  met: z.boolean(),
});

export const budgetFitSchema = z.enum([
  "good_fit",
  "under_budget",
  "over_budget",
  "unknown",
]);

export const interviewPlanItemSchema = z.object({
  theme: z.string().min(1).max(300),
  starSeed: z.string().min(1).max(1500),
});

export const evaluationBlocksSchema = z.object({
  roleSummary: z.string().min(1).max(4000),
  cvMatch: z.object({
    evidence: z.array(cvMatchEvidenceSchema).max(40),
    gaps: z.array(z.string().max(500)).max(40),
  }),
  levelStrategy: z.string().min(1).max(4000),
  compDemand: z.object({
    summary: z.string().min(1).max(4000),
    budgetFit: budgetFitSchema,
  }),
  customization: z.string().min(1).max(4000),
  interviewPlan: z.array(interviewPlanItemSchema).max(20).optional(),
});

/** The full, server-assembled evaluation summary that is persisted and rendered. */
export const evaluationSummarySchema = z.object({
  jobId: z.number().int().positive(),
  score: z.number().min(0).max(100),
  score5: z.number().min(1).max(5),
  band: evaluationBandSchema,
  jobFamily: z.string().min(1).max(60),
  archetype: z.string().min(1).max(60),
  dimensions: z.array(evaluationDimensionSchema).min(1).max(20),
  blocks: evaluationBlocksSchema,
  recommendation: z.string().min(1).max(4000),
});

/**
 * The subset the LLM is asked to produce (spec #3 §6 determinism boundary): score5 +
 * rationale for the reasoned dimensions, the A–F prose blocks, and the recommendation.
 * The server merges these with the deterministic dimensions and computes the final
 * score/band before assembling {@link evaluationSummarySchema}.
 */
export const evaluationLlmPartSchema = z.object({
  dimensions: z
    .array(
      z.object({
        key: z.string().min(1).max(60),
        score5: z.number().min(1).max(5),
        rationale: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(12),
  blocks: evaluationBlocksSchema,
  recommendation: z.string().min(1).max(4000),
});

export type EvaluationBand = z.infer<typeof evaluationBandSchema>;
export type DimensionSource = z.infer<typeof dimensionSourceSchema>;
export type EvaluationDimension = z.infer<typeof evaluationDimensionSchema>;
export type EvaluationBlocks = z.infer<typeof evaluationBlocksSchema>;
export type EvaluationSummary = z.infer<typeof evaluationSummarySchema>;
export type EvaluationLlmPart = z.infer<typeof evaluationLlmPartSchema>;

/** The registered `evaluation` artifact (kind + version + schema + helpers). */
export const evaluationArtifact = defineArtifact(
  "evaluation",
  EVALUATION_SCHEMA_VERSION,
  evaluationSummarySchema,
);
