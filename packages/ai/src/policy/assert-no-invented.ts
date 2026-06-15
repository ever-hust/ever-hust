/**
 * No-invent grounding validator (spec #6, constitution Article 7).
 *
 * Advisory post-generation check: flags claims in AI-written prose — proper nouns
 * (employers/credentials), years, and significant numbers — that are NOT traceable to the
 * grounded `allowedFacts` (the real user/job data the model was given). Flagged claims should
 * be treated as gaps, not facts. It never throws and never hard-blocks generation — it composes
 * with the epic #5 structured `summary` (the whitelisted, queryable surface).
 */
export interface NoInventedResult {
  grounded: boolean;
  flaggedClaims: string[];
}

// Proper-noun sequences: 2+ capitalized tokens, each ≥2 chars (excludes a lone sentence-start "I").
const PROPER_NOUN_RE = /\b([A-Z][A-Za-z0-9&.]{1,}(?:\s+[A-Z][A-Za-z0-9&.]{1,})+)\b/g;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
// Money / percent / multiplier / large numbers: $120k, 45%, 10x, 1,200, 3.5
const NUMBER_RE = /\$?\d[\d,]*(?:\.\d+)?\s?(?:%|k|m|x|\+)?/gi;

export function assertNoInvented(input: {
  text: string;
  allowedFacts: string[];
}): NoInventedResult {
  const haystack = input.allowedFacts.join(" \n ").toLowerCase();
  const flagged: string[] = [];
  const seen = new Set<string>();

  const check = (raw: string) => {
    // Strip trailing punctuation a greedy match can capture (e.g. "2019," / "Platform.").
    const token = raw.trim().replace(/[.,;:]+$/, "");
    if (!token) return;
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (!haystack.includes(key)) flagged.push(token);
  };

  for (const m of input.text.matchAll(PROPER_NOUN_RE)) check(m[1] ?? "");
  for (const m of input.text.matchAll(YEAR_RE)) check(m[0] ?? "");
  for (const m of input.text.matchAll(NUMBER_RE)) {
    const tok = (m[0] ?? "").trim();
    // Skip bare single digits ("1 role") — too noisy to be meaningful claims.
    if (/^\$?\d$/.test(tok)) continue;
    check(tok);
  }

  return { grounded: flagged.length === 0, flaggedClaims: flagged };
}

// ---------------------------------------------------------------------------
// Opt-in enforcement layer (spec #6 — "advisory → enforcing" hardening).
//
// `assertNoInvented` stays advisory and is the default everywhere. Flows that want to *block*
// ungrounded prose (rather than merely flag it) can opt into `evaluateNoInvent` / `assertGrounded`
// with an enforce policy. Default policy is advisory, so importing this changes nothing until a
// caller explicitly enforces. A small `maxFlaggedClaims` tolerance avoids over-blocking on the
// heuristic's known false positives (e.g. common multi-word phrases).
// ---------------------------------------------------------------------------

export type NoInventMode = "advisory" | "enforce";

export interface NoInventPolicy {
  mode: NoInventMode;
  /** In enforce mode, allow up to this many flagged claims before blocking. */
  maxFlaggedClaims: number;
}

export const DEFAULT_NO_INVENT_POLICY: NoInventPolicy = {
  mode: "advisory",
  maxFlaggedClaims: 0,
};

export interface NoInventDecision extends NoInventedResult {
  /** Whether the prose is allowed to ship under the policy. Always true in advisory mode. */
  allowed: boolean;
  reason: "grounded" | "advisory" | "too_many_claims";
}

export function evaluateNoInvent(
  input: { text: string; allowedFacts: string[] },
  policy: NoInventPolicy = DEFAULT_NO_INVENT_POLICY,
): NoInventDecision {
  const result = assertNoInvented(input);

  if (result.grounded) {
    return { ...result, allowed: true, reason: "grounded" };
  }
  if (policy.mode === "advisory") {
    return { ...result, allowed: true, reason: "advisory" };
  }
  // enforce mode
  const allowed = result.flaggedClaims.length <= policy.maxFlaggedClaims;
  return {
    ...result,
    allowed,
    reason: allowed ? "grounded" : "too_many_claims",
  };
}

/** Thrown by {@link assertGrounded} when an enforce-mode policy rejects ungrounded prose. */
export class NoInventError extends Error {
  constructor(public readonly flaggedClaims: string[]) {
    super(
      `Generated text contains ${flaggedClaims.length} ungrounded claim(s): ${flaggedClaims.join(", ")}`,
    );
    this.name = "NoInventError";
  }
}

/**
 * Enforce-or-pass: returns the decision in advisory mode (never throws), but throws
 * {@link NoInventError} when an enforce-mode policy rejects the prose. Callers that want a hard
 * gate use this; everyone else keeps using the advisory {@link assertNoInvented}.
 */
export function assertGrounded(
  input: { text: string; allowedFacts: string[] },
  policy: NoInventPolicy = DEFAULT_NO_INVENT_POLICY,
): NoInventDecision {
  const decision = evaluateNoInvent(input, policy);
  if (!decision.allowed) throw new NoInventError(decision.flaggedClaims);
  return decision;
}
