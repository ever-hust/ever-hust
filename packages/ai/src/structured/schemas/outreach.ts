import { z } from "zod";
import { defineArtifact } from "../contract";

/** Outreach-draft machine summary (spec #17), built on the #5 structured-output contract. */
export const OUTREACH_SCHEMA_VERSION = 1;

/**
 * The part the LLM produces (grounded prose): a 3-sentence framework message —
 * hook → credibility → ask. Draft-only; Hust never sends it.
 */
export const outreachDraftSchema = z.object({
  /** Sentence 1 — the hook (why you're reaching out, anchored to the role/company). */
  hook: z.string().min(1).max(600),
  /** Sentence 2 — credibility (your real, grounded background that fits). */
  credibility: z.string().min(1).max(600),
  /** Sentence 3 — the ask (a small, specific, low-friction request). */
  ask: z.string().min(1).max(600),
  /** The assembled copy-paste message (hook + credibility + ask). */
  message: z.string().min(1).max(2000),
  /** The grounded background points the message leaned on. */
  highlightedBackground: z.array(z.string().max(120)).max(20),
});

export const outreachSummarySchema = outreachDraftSchema.extend({
  jobId: z.number().int().positive(),
  contactType: z.enum(["recruiter", "hiring_manager", "referral"]),
  /** No-invent audit (spec #6): true when the message cites only grounded facts. */
  grounded: z.boolean(),
  flaggedClaims: z.array(z.string().max(300)).max(40),
});

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;
export type OutreachSummary = z.infer<typeof outreachSummarySchema>;

export const outreachArtifact = defineArtifact(
  "outreach",
  OUTREACH_SCHEMA_VERSION,
  outreachSummarySchema,
);
