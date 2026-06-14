import type {
  EvaluationBand,
  BudgetFit,
  DimensionSource,
} from "../structured/schemas/evaluation";

/**
 * Deterministic scoring core for the evaluation engine (spec #3 §3.2, §3.3, §6).
 *
 * Everything here is pure and unit-tested without the LLM: weight resolution, the
 * server-computed dimensions (Comp, Remote, Level), the CV skill-overlap baseline, and
 * the score → band mapping. The LLM reasons the remaining dimensions + prose blocks.
 */

export interface DimensionDef {
  key: string;
  label: string;
  weight: number; // percentage; the defaults sum to 100
  source: DimensionSource;
}

/** Default 10-dimension matrix (weights sum to 100). */
export const DEFAULT_DIMENSIONS: readonly DimensionDef[] = [
  { key: "north_star", label: "North Star alignment", weight: 25, source: "llm" },
  { key: "cv_match", label: "CV match", weight: 15, source: "llm" },
  { key: "level", label: "Level", weight: 15, source: "deterministic" },
  { key: "comp", label: "Comp", weight: 10, source: "deterministic" },
  { key: "growth", label: "Growth", weight: 10, source: "llm" },
  { key: "remote", label: "Remote", weight: 5, source: "deterministic" },
  { key: "reputation", label: "Reputation", weight: 5, source: "llm" },
  { key: "tech", label: "Tech", weight: 5, source: "llm" },
  { key: "speed", label: "Speed", weight: 5, source: "llm" },
  { key: "culture", label: "Culture", weight: 5, source: "llm" },
];

export const DETERMINISTIC_KEYS = DEFAULT_DIMENSIONS.filter(
  (d) => d.source === "deterministic",
).map((d) => d.key);

export const LLM_KEYS = DEFAULT_DIMENSIONS.filter(
  (d) => d.source === "llm",
).map((d) => d.key);

const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  DEFAULT_DIMENSIONS.map((d) => [d.key, d.weight]),
);

export interface WeightLayers {
  /** Lowest precedence after default. */
  org?: Record<string, number> | null;
  user?: Record<string, number> | null;
  /** Highest precedence (per-call "what if comp mattered more?"). */
  override?: Record<string, number> | null;
}

export interface ResolvedWeights {
  weights: Record<string, number>; // per known dimension key; sums to 100
  usedDefault: boolean;
}

/**
 * Resolve effective per-dimension weights with precedence override → user → org → default
 * (spec #3 §10). Unknown keys are ignored (forward-compatible); any out-of-range / non-finite
 * value makes the layer set invalid and falls back to the default matrix. Valid results are
 * renormalized to sum to exactly 100, so a partial override stays valid.
 *
 * NOTE: the spec §4 draft typed the override as fractions (0..1). We use percentages (0..100)
 * to match the user/org/default layers and renormalize — recorded as a decision in spec #3 §10.
 */
export function resolveWeights(layers: WeightLayers): ResolvedWeights {
  const merged: Record<string, number> = { ...DEFAULT_WEIGHTS };
  let invalid = false;

  for (const layer of [layers.org, layers.user, layers.override]) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (!(key in DEFAULT_WEIGHTS)) continue; // ignore unknown dimension
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
        invalid = true;
        continue;
      }
      merged[key] = value;
    }
  }

  const sum = Object.values(merged).reduce((a, b) => a + b, 0);
  if (invalid || sum <= 0) {
    return { weights: { ...DEFAULT_WEIGHTS }, usedDefault: true };
  }

  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(merged)) {
    normalized[key] = (value / sum) * 100;
  }
  return { weights: normalized, usedDefault: false };
}

// ── Deterministic dimension scorers ─────────────────────────────────────────

function fmtMoney(n: number): string {
  return `$${Math.round(n / 1000)}k`;
}

function midpoint(min: number | null, max: number | null): number | null {
  if (min != null && max != null) return (min + max) / 2;
  if (min != null) return min;
  if (max != null) return max;
  return null;
}

export interface CompScore {
  score5: number;
  rationale: string;
  budgetFit: BudgetFit;
}

/** Comp dimension: annualized posting salary vs the user's target floor. */
export function scoreComp(
  job: { salaryMin: number | null; salaryMax: number | null },
  target: { min: number | null; max: number | null },
): CompScore {
  const jobMid = midpoint(job.salaryMin, job.salaryMax);
  const targetFloor = target.min ?? target.max ?? null;

  if (jobMid == null) {
    return {
      score5: 3,
      rationale: "No salary on the posting — scored neutral.",
      budgetFit: "unknown",
    };
  }
  if (targetFloor == null || targetFloor <= 0) {
    return {
      score5: 3,
      rationale: `Posting pays ~${fmtMoney(jobMid)}, but you haven't set a target — scored neutral.`,
      budgetFit: "unknown",
    };
  }

  const ratio = jobMid / targetFloor;
  let score5: number;
  let budgetFit: BudgetFit;
  if (ratio >= 1.2) {
    score5 = 5;
    budgetFit = "good_fit";
  } else if (ratio >= 1.0) {
    score5 = 4;
    budgetFit = "good_fit";
  } else if (ratio >= 0.9) {
    score5 = 3;
    budgetFit = "under_budget";
  } else if (ratio >= 0.75) {
    score5 = 2;
    budgetFit = "under_budget";
  } else {
    score5 = 1;
    budgetFit = "under_budget";
  }
  if (ratio >= 1.6) budgetFit = "over_budget"; // far above ask — possible level stretch

  return {
    score5,
    rationale: `Posting midpoint ~${fmtMoney(jobMid)} vs your target ~${fmtMoney(targetFloor)} (${Math.round(ratio * 100)}%).`,
    budgetFit,
  };
}

export type RemotePreference = "remote" | "hybrid" | "onsite" | "any" | null;

export interface DeterministicScore {
  score5: number;
  rationale: string;
}

/** Remote dimension: posting work-mode vs the user's remote preference. */
export function scoreRemote(
  jobIsRemote: boolean | null,
  pref: RemotePreference,
): DeterministicScore {
  if (pref == null || pref === "any") {
    return { score5: 4, rationale: "No strict remote preference — most arrangements work." };
  }
  if (jobIsRemote == null) {
    return { score5: 3, rationale: "Posting doesn't state a work mode — scored neutral." };
  }
  if (pref === "remote") {
    return jobIsRemote
      ? { score5: 5, rationale: "Remote role matches your remote preference." }
      : { score5: 2, rationale: "On-site role conflicts with your remote preference." };
  }
  if (pref === "onsite") {
    return jobIsRemote
      ? { score5: 3, rationale: "Remote role, but you prefer on-site." }
      : { score5: 5, rationale: "On-site role matches your preference." };
  }
  // hybrid — flexible either way
  return {
    score5: 4,
    rationale: jobIsRemote
      ? "Remote role; you're open to hybrid."
      : "On-site role; you're open to hybrid.",
  };
}

const LEVEL_ORDINALS: { keyword: string; ord: number }[] = [
  { keyword: "vice president", ord: 6 },
  { keyword: "executive", ord: 6 },
  { keyword: "c-level", ord: 6 },
  { keyword: "vp", ord: 6 },
  { keyword: "senior manager", ord: 5 },
  { keyword: "director", ord: 5 },
  { keyword: "principal", ord: 5 },
  { keyword: "head", ord: 5 },
  { keyword: "staff", ord: 4 },
  { keyword: "lead", ord: 4 },
  { keyword: "manager", ord: 4 },
  { keyword: "senior", ord: 3 },
  { keyword: "sr.", ord: 3 },
  { keyword: "sr ", ord: 3 },
  { keyword: "mid", ord: 2 },
  { keyword: "intermediate", ord: 2 },
  { keyword: "associate", ord: 2 },
  { keyword: "junior", ord: 1 },
  { keyword: "entry", ord: 1 },
  { keyword: "intern", ord: 1 },
  { keyword: "graduate", ord: 1 },
];

/** Map a free-text seniority label to an ordinal 1..6 (longest keyword wins). */
export function levelOrdinal(label: string | null | undefined): number | null {
  if (!label) return null;
  const s = label.toLowerCase();
  for (const { keyword, ord } of LEVEL_ORDINALS) {
    if (s.includes(keyword)) return ord;
  }
  return null;
}

/** Level dimension: posting seniority vs the user's natural level. */
export function scoreLevel(
  jobLevel: string | null,
  userLevel: string | null,
): DeterministicScore {
  const j = levelOrdinal(jobLevel);
  const u = levelOrdinal(userLevel);
  if (j == null || u == null) {
    return { score5: 3, rationale: "Level not clearly stated — scored neutral." };
  }
  const diff = j - u;
  const ad = Math.abs(diff);
  const score5 = ad === 0 ? 5 : ad === 1 ? 4 : ad === 2 ? 3 : ad === 3 ? 2 : 1;
  const dir = diff > 0 ? "above" : diff < 0 ? "below" : "at";
  return {
    score5,
    rationale:
      diff === 0
        ? "Role is at your level."
        : `Role is ${dir} your level (by ${ad}).`,
  };
}

export interface CvOverlap {
  ratio: number;
  matched: string[];
  missing: string[];
}

function normSkill(s: string): string {
  return s.trim().toLowerCase().replace(/[.\s]+$/g, "");
}

/** Deterministic CV-match baseline: skill overlap between the user and the posting. */
export function cvSkillOverlap(
  userSkills: string[],
  jobSkills: string[],
): CvOverlap {
  const userSet = new Set(userSkills.map(normSkill).filter(Boolean));
  const seen = new Set<string>();
  const matched: string[] = [];
  const missing: string[] = [];
  for (const raw of jobSkills) {
    const n = normSkill(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (userSet.has(n)) matched.push(raw);
    else missing.push(raw);
  }
  const total = matched.length + missing.length;
  return {
    ratio: total > 0 ? matched.length / total : 0,
    matched,
    missing,
  };
}

// ── Aggregate score + band ──────────────────────────────────────────────────

export function bandFromScore5(score5: number): EvaluationBand {
  if (score5 >= 4.5) return "apply_now";
  if (score5 >= 4.0) return "worth_it";
  if (score5 >= 3.5) return "specific_reason";
  return "not_recommended";
}

export interface AggregateScore {
  score5: number; // 1..5, one decimal
  score100: number; // 0..100
  band: EvaluationBand;
}

/** Weighted aggregate of the scored dimensions → 1–5, a 0–100 mirror, and a band. */
export function computeScore(
  dimensions: { weight: number; score5: number }[],
): AggregateScore {
  const totalWeight = dimensions.reduce((a, d) => a + d.weight, 0) || 1;
  const weighted = dimensions.reduce(
    (a, d) => a + (d.weight / totalWeight) * d.score5,
    0,
  );
  const score5 = Math.round(weighted * 10) / 10;
  const score100 = Math.round((score5 / 5) * 100);
  return { score5, score100, band: bandFromScore5(score5) };
}
