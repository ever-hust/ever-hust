import { z } from "zod";
import { defineArtifact } from "../contract";

/** Negotiation-brief machine summary (spec #15), built on the #5 structured-output contract. */
export const NEGOTIATION_SCHEMA_VERSION = 1;

/** A market-anchored target range (no invented numbers — figures trace to provided facts). */
export const negotiationTargetRangeSchema = z.object({
  /** Lower bound of the recommended ask (currency-agnostic figure). */
  low: z.number().nonnegative(),
  /** Upper bound of the recommended ask. */
  high: z.number().nonnegative(),
  /** Where the numbers come from — the posting salary and/or the user's stated target. */
  basis: z.string().min(1).max(600),
});

/** A concise, ready-to-send negotiation script (counter / competing-offer / non-comp ask). */
export const negotiationScriptSchema = z.object({
  scenario: z.enum(["counter", "competing_offer", "non_comp_ask"]),
  script: z.string().min(1).max(1200),
});

/** The part the LLM produces (grounded prose). */
export const negotiationDraftSchema = z.object({
  /** One-line framing of the offer-stage situation. */
  summary: z.string().min(1).max(800),
  targetRange: negotiationTargetRangeSchema,
  /** 3–5 leverage points drawn from the candidate's real strengths. */
  leveragePoints: z.array(z.string().min(1).max(400)).min(3).max(5),
  /** 2–3 concise negotiation scripts. */
  scripts: z.array(negotiationScriptSchema).min(2).max(3),
  /** Common pitfalls to avoid at the offer stage. */
  pitfalls: z.array(z.string().min(1).max(400)).min(1).max(6),
});

export const negotiationSummarySchema = negotiationDraftSchema.extend({
  jobId: z.number().int().positive(),
  /** No-invent audit (spec #6): true when the brief cites only grounded facts. */
  grounded: z.boolean(),
  flaggedClaims: z.array(z.string().max(300)).max(40),
});

export type NegotiationTargetRange = z.infer<typeof negotiationTargetRangeSchema>;
export type NegotiationScript = z.infer<typeof negotiationScriptSchema>;
export type NegotiationDraft = z.infer<typeof negotiationDraftSchema>;
export type NegotiationSummary = z.infer<typeof negotiationSummarySchema>;

export const negotiationArtifact = defineArtifact(
  "negotiation",
  NEGOTIATION_SCHEMA_VERSION,
  negotiationSummarySchema,
);
