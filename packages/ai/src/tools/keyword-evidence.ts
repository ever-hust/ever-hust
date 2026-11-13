/**
 * Deterministic check of which target keywords a candidate's real CV already evidences.
 *
 * Tailoring should align wording with what the candidate has actually done — not push them to
 * stuff keywords they cannot back up. This splits a keyword list into "evidenced in the CV"
 * and "not in the CV" using only the candidate's own skills/experience text (no LLM).
 * Matching is conservative: a false "evidenced" would cost the user more than a false "gap".
 */

export interface KeywordEvidence {
  /** Keywords the CV supports (skill list or experience/summary text). */
  inCv: string[];
  /** Keywords with no support in the CV — only add them if they are true. */
  notInCv: string[];
}

const MAX_KEYWORDS = 60;

/** Lowercase, trim, collapse whitespace and drop a trailing ".js" so "React.js" ≈ "React". */
function normalize(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.js$/, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Short pure-letter terms ("go", "r", "sql") collide with ordinary words in free text
 * ("go to market"), so they only count when they appear in the explicit skill list.
 */
function allowsFreeTextMatch(term: string): boolean {
  return term.length >= 4 || /[^a-z\s]/.test(term);
}

/**
 * @param keywords     target keywords (JD skills / ATS keywords)
 * @param skills       the candidate's explicit skill list
 * @param evidenceText free text from the candidate's CV (summary, experience lines)
 */
export function splitKeywordsByCvEvidence(
  keywords: string[],
  skills: string[],
  evidenceText: string,
): KeywordEvidence {
  const skillSet = new Set(skills.map(normalize).filter(Boolean));
  const text = evidenceText.toLowerCase();

  const inCv: string[] = [];
  const notInCv: string[] = [];
  const seen = new Set<string>();

  for (const raw of keywords.slice(0, MAX_KEYWORDS)) {
    if (typeof raw !== "string") continue;
    const term = normalize(raw);
    if (!term || seen.has(term)) continue;
    seen.add(term);

    let evidenced = skillSet.has(term);
    if (!evidenced && allowsFreeTextMatch(term)) {
      const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}(?:\\.js)?(?![a-z0-9+#])`);
      evidenced = re.test(text);
    }
    (evidenced ? inCv : notInCv).push(raw.trim());
  }

  return { inCv, notInCv };
}
