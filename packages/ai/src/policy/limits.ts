import { FREE_LIMITS } from "@ever-hust/stripe";

/**
 * Per-tier policy limits (spec #6 §3). Reuses the canonical `FREE_LIMITS` from
 * `@ever-hust/stripe` (the source of truth for search/cover-letter caps) and adds the
 * evaluation/batch caps the cost gate consumes. Keep code-constant in v1; configurable later.
 */
export { FREE_LIMITS };

/** Free-tier on-demand evaluations per day (mirrors the searches/day shape). */
export const EVALUATIONS_FREE_PER_DAY = 10;

/** Max concurrent jobs in a background batch evaluation run (epic #19). */
export const BATCH_EVAL_MAX_CONCURRENCY = 5;

/** Default fit-score floor below which expensive batch generation is skipped. */
export const DEFAULT_SCORE_FLOOR = 60;
