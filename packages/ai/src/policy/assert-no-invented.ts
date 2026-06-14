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
