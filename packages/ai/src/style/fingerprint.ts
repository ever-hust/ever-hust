/**
 * Writing-style fingerprint (spec #14).
 *
 * PRIVACY INVARIANT: we never store or re-feed the user's raw writing. This extractor produces
 * only *aggregate* metrics (sentence length, formality, first-person usage, generic connector
 * usage from a fixed vocabulary) — never n-grams or content tokens from the input. The fingerprint
 * personalizes generated prose (cover letters, outreach) without retaining what the user wrote.
 */
export type Formality = "formal" | "neutral" | "casual";

export interface StyleFingerprint {
  sampleCount: number;
  avgSentenceLength: number; // words per sentence
  avgWordLength: number; // chars per word
  firstPersonRatio: number; // 0..1
  formality: Formality;
  /** Which connectors from a FIXED generic vocabulary the user tends to use (not their content). */
  connectors: string[];
}

// Fixed, generic vocabulary — these are structural words, not user content.
const CONNECTORS = [
  "however",
  "therefore",
  "moreover",
  "furthermore",
  "additionally",
  "consequently",
  "meanwhile",
  "nonetheless",
  "thus",
  "hence",
];
const FIRST_PERSON = new Set(["i", "me", "my", "mine", "we", "our", "us"]);
const CASUAL_MARKERS = ["gonna", "wanna", "stuff", "kinda", "really", "totally", "awesome"];

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractStyleFingerprint(samples: string[]): StyleFingerprint {
  const clean = samples.filter((s) => typeof s === "string" && s.trim().length > 0);
  const joined = clean.join("\n");
  const allWords = words(joined);
  const allSentences = sentences(joined);

  const wordCount = allWords.length;
  const sentenceCount = Math.max(1, allSentences.length);

  const avgSentenceLength =
    wordCount > 0 ? Math.round((wordCount / sentenceCount) * 10) / 10 : 0;
  const avgWordLength =
    wordCount > 0
      ? Math.round((allWords.reduce((a, w) => a + w.length, 0) / wordCount) * 10) / 10
      : 0;

  const firstPersonCount = allWords.filter((w) => FIRST_PERSON.has(w)).length;
  const firstPersonRatio =
    wordCount > 0 ? Math.round((firstPersonCount / wordCount) * 100) / 100 : 0;

  const contractions = (joined.match(/\b\w+'\w+\b/g) ?? []).length;
  const casualHits = CASUAL_MARKERS.filter((m) => allWords.includes(m)).length;
  const contractionRatio = wordCount > 0 ? contractions / wordCount : 0;

  let formality: Formality;
  if (casualHits >= 2 || contractionRatio > 0.03) {
    formality = "casual";
  } else if (avgWordLength >= 6 && contractionRatio === 0) {
    // Long average word length with no contractions reads as formal.
    formality = "formal";
  } else {
    formality = "neutral";
  }

  const connectors = CONNECTORS.filter((c) => allWords.includes(c));

  return {
    sampleCount: clean.length,
    avgSentenceLength,
    avgWordLength,
    firstPersonRatio,
    formality,
    connectors,
  };
}
