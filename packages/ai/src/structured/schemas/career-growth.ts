import { z } from "zod";
import { defineArtifact } from "../contract";

/** Career-growth advisory artifact (spec #18), built on the #5 contract. */
export const CAREER_GROWTH_SCHEMA_VERSION = 1;

export const growthRecommendationSchema = z.object({
  action: z.string().min(1).max(400),
  type: z.enum(["skill", "project", "certification", "experience"]),
  rationale: z.string().min(1).max(1000),
  priority: z.enum(["high", "medium", "low"]),
});

export const recurringGapSchema = z.object({
  skill: z.string().min(1).max(120),
  frequency: z.number().int().nonnegative(),
});

/** The part the LLM produces from the aggregated gaps. */
export const careerGrowthLlmPartSchema = z.object({
  recommendations: z.array(growthRecommendationSchema).min(1).max(12),
  summary: z.string().min(1).max(2000),
});

export const careerGrowthSummarySchema = careerGrowthLlmPartSchema.extend({
  recurringGaps: z.array(recurringGapSchema).max(20),
});

export type GrowthRecommendation = z.infer<typeof growthRecommendationSchema>;
export type CareerGrowthLlmPart = z.infer<typeof careerGrowthLlmPartSchema>;
export type CareerGrowthSummary = z.infer<typeof careerGrowthSummarySchema>;

export const careerGrowthArtifact = defineArtifact(
  "career_growth",
  CAREER_GROWTH_SCHEMA_VERSION,
  careerGrowthSummarySchema,
);
