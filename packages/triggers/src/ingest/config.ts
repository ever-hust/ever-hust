import { SITE_CATEGORIES, type ScraperInput, type SiteCategory } from "@ever-hust/jobs-api";
import { SEARCH_TERMS } from "../map-job";
import type { UpstreamContract } from "./upstream-contract";

/**
 * Sync modes (spec 01a FR-10).
 *
 * - `full`     — keyword-less list mode: every default source returns what it can list without a
 *               keyword, up to `resultsWanted` per source.
 * - `keywords` — the rotating keyword search, restricted to the site categories that actually
 *               honour a keyword (most ATS/company adapters ignore it and are covered by `full`).
 */
export type SyncMode = "keywords" | "full";
export const SYNC_MODES: readonly SyncMode[] = ["keywords", "full"];

export const DEFAULT_FULL_RESULTS_PER_SOURCE = 1000;
export const DEFAULT_KEYWORD_RESULTS_PER_SOURCE = 100;
export const DEFAULT_KEYWORD_SITE_CATEGORIES: readonly SiteCategory[] = [
  "job-board",
  "niche",
  "regional",
  "remote",
  "government",
  "freelance",
];
/** Upper bound for any per-source result count (env or request body) — spec 01a §7.2. */
export const MAX_RESULTS_PER_SOURCE = 1000;
/**
 * Per-source count of keyword runs while Ever Jobs is not known to speak contract v1: the count
 * the sync used before it (such a server ignores `siteCategories` and asks every source for it).
 */
export const LEGACY_RESULTS_PER_SOURCE = 80;

/**
 * `JOBS_SYNC_FULL_ENABLED`: `auto` (default) runs full mode only once this process has seen Ever
 * Jobs answer in NDJSON (contract v1); `true` always runs it; `false` never does (spec 01a D18).
 */
export type FullSyncSetting = "auto" | "on" | "off";
/** Hard ceiling on keyword terms per request — each term is a full upstream fan-out. */
export const MAX_SEARCH_TERMS = 5;
export const DEFAULT_GEOCODE_MAX_CALLS = 500;
/** Keyword runs happen every 15 min: a lower per-run Google cap (never above the general cap). */
export const DEFAULT_KEYWORD_GEOCODE_MAX_CALLS = 100;
export const DEFAULT_INGEST_BATCH_SIZE = 250;
/** One rotation slot per scheduler tick. */
export const ROTATION_SLOT_MS = 15 * 60 * 1000;

export interface SyncEnvConfig {
  /** Whether full (keyword-less) runs may run — see {@link FullSyncSetting}. Default "auto". */
  fullSync?: FullSyncSetting;
  fullResultsPerSource: number;
  keywordResultsPerSource: number;
  keywordSiteCategories: SiteCategory[];
  /** Per-run Google geocoding cap for full runs, and the ceiling for keyword runs. */
  geocodeMaxCalls: number;
  /** Per-run Google geocoding cap for keyword runs (≤ `geocodeMaxCalls`). */
  keywordGeocodeMaxCalls: number;
}

type Env = Record<string, string | undefined>;

/** Parse a positive integer, falling back to `fallback` for unset / invalid values, clamped to `max`. */
export function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/** Non-negative integer variant (0 is meaningful, e.g. "no Google calls"). */
export function parseNonNegativeInt(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, max);
}

export function parseFullSyncSetting(value: string | undefined): FullSyncSetting {
  const v = (value ?? "").trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(v)) return "on";
  if (["false", "0", "off", "no"].includes(v)) return "off";
  if (v !== "" && v !== "auto") {
    console.warn(`[jobs-sync] Unknown JOBS_SYNC_FULL_ENABLED value "${value}"; using auto`);
  }
  return "auto";
}

export function isSiteCategory(value: string): value is SiteCategory {
  return (SITE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Parse a comma-separated category list. Unknown values are dropped (Ever Jobs answers 400 to an
 * unknown category); an unset/blank value, or one with no valid entry, yields the fallback.
 */
export function parseSiteCategories(
  value: string | undefined,
  fallback: readonly SiteCategory[],
): { categories: SiteCategory[]; rejected: string[] } {
  if (value === undefined || value.trim() === "") return { categories: [...fallback], rejected: [] };
  const parts = value
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const categories = [...new Set(parts.filter(isSiteCategory))];
  const rejected = parts.filter((p) => !isSiteCategory(p));
  return { categories: categories.length > 0 ? categories : [...fallback], rejected };
}

export function readSyncEnv(env: Env = process.env): SyncEnvConfig {
  const { categories, rejected } = parseSiteCategories(
    env.JOBS_SYNC_KEYWORD_SITE_CATEGORIES,
    DEFAULT_KEYWORD_SITE_CATEGORIES,
  );
  if (rejected.length > 0) {
    console.warn(
      `[jobs-sync] Ignoring unknown JOBS_SYNC_KEYWORD_SITE_CATEGORIES values: ${rejected.join(", ")}`,
    );
  }
  const geocodeMaxCalls = parseNonNegativeInt(
    env.JOBS_SYNC_GEOCODE_MAX_CALLS,
    DEFAULT_GEOCODE_MAX_CALLS,
    100_000,
  );
  return {
    fullSync: parseFullSyncSetting(env.JOBS_SYNC_FULL_ENABLED),
    fullResultsPerSource: parsePositiveInt(
      env.JOBS_SYNC_FULL_RESULTS_PER_SOURCE,
      DEFAULT_FULL_RESULTS_PER_SOURCE,
      MAX_RESULTS_PER_SOURCE,
    ),
    keywordResultsPerSource: parsePositiveInt(
      env.JOBS_SYNC_KEYWORD_RESULTS_PER_SOURCE,
      DEFAULT_KEYWORD_RESULTS_PER_SOURCE,
      MAX_RESULTS_PER_SOURCE,
    ),
    keywordSiteCategories: categories,
    geocodeMaxCalls,
    keywordGeocodeMaxCalls: Math.min(
      parseNonNegativeInt(
        env.JOBS_SYNC_KEYWORD_GEOCODE_MAX_CALLS,
        DEFAULT_KEYWORD_GEOCODE_MAX_CALLS,
        100_000,
      ),
      geocodeMaxCalls,
    ),
  };
}

/** The per-run Google geocoding cap for a sync mode. */
export function geocodeMaxCallsFor(mode: SyncMode, env: SyncEnvConfig): number {
  return mode === "keywords" ? env.keywordGeocodeMaxCalls : env.geocodeMaxCalls;
}

/** The rotation term for the scheduler slot containing `now` (one term per 15-min tick). */
export function rotationTerm(now: number = Date.now(), terms: readonly string[] = SEARCH_TERMS): string {
  const slot = Math.floor(now / ROTATION_SLOT_MS);
  return terms[((slot % terms.length) + terms.length) % terms.length]!;
}

export interface SyncRequestOptions {
  mode?: SyncMode;
  /** Keywords mode: explicit terms instead of the rotation (trimmed, blanks dropped, ≤ 5). */
  searchTerms?: string[];
  /** Per-source result count override. */
  resultsWanted?: number;
  /** Keywords mode: category override. */
  siteCategories?: SiteCategory[];
}

export interface SyncPlan {
  mode: SyncMode;
  /** Keyword terms, one upstream request each; empty in full mode. */
  terms: string[];
  /** One upstream request per entry, run sequentially. Empty when {@link skipped}. */
  inputs: ScraperInput[];
  /** Why the run does nothing (full mode gated off, spec 01a D18). */
  skipped?: string;
}

/** Fields shared by every sync request. */
const BASE_INPUT = {
  descriptionFormat: "markdown",
  distance: 50,
  // Kept only as the Indeed-style country hint; it is not a location filter.
  country: "USA",
} as const;

/**
 * The plan for one run. `contract` is what this process has seen of Ever Jobs (spec 01a D18):
 * until it is "v1", full mode is skipped (unless forced with `JOBS_SYNC_FULL_ENABLED=true`) and
 * keyword runs use {@link LEGACY_RESULTS_PER_SOURCE}. An explicit `resultsWanted` always wins.
 */
export function buildSyncPlan(
  options: SyncRequestOptions = {},
  env: SyncEnvConfig = readSyncEnv(),
  now: number = Date.now(),
  contract: UpstreamContract = "unknown",
): SyncPlan {
  const mode: SyncMode = options.mode ?? "keywords";
  const override =
    options.resultsWanted !== undefined && Number.isFinite(options.resultsWanted) && options.resultsWanted > 0
      ? Math.min(Math.floor(options.resultsWanted), MAX_RESULTS_PER_SOURCE)
      : undefined;

  if (mode === "full") {
    const setting = env.fullSync ?? "auto";
    const skipped =
      setting === "off"
        ? "full sync disabled (JOBS_SYNC_FULL_ENABLED=false)"
        : setting === "auto" && contract !== "v1"
          ? contract === "legacy"
            ? "Ever Jobs predates contract v1 (no list mode / NDJSON): a full sync would ask every source for its whole result count and keep one page; upgrade Ever Jobs or set JOBS_SYNC_FULL_ENABLED=true"
            : "Ever Jobs has not answered in NDJSON (contract v1) in this process yet; the keyword runs detect it (set JOBS_SYNC_FULL_ENABLED=true to force)"
          : undefined;
    if (skipped) return { mode, terms: [], inputs: [], skipped };
    return {
      mode,
      terms: [],
      inputs: [
        {
          ...BASE_INPUT,
          // List mode (contract v1 C1): no searchTerm, no siteCategories → all default sources.
          resultsWanted: override ?? env.fullResultsPerSource,
        },
      ],
    };
  }

  const explicit = (options.searchTerms ?? [])
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0);
  const terms =
    explicit.length > 0 ? [...new Set(explicit)].slice(0, MAX_SEARCH_TERMS) : [rotationTerm(now)];
  const siteCategories =
    options.siteCategories && options.siteCategories.length > 0
      ? [...options.siteCategories]
      : [...env.keywordSiteCategories];

  const perSource =
    override ??
    (contract === "v1"
      ? env.keywordResultsPerSource
      : Math.min(env.keywordResultsPerSource, LEGACY_RESULTS_PER_SOURCE));

  return {
    mode,
    terms,
    inputs: terms.map((searchTerm) => ({
      ...BASE_INPUT,
      searchTerm,
      siteCategories,
      resultsWanted: perSource,
    })),
  };
}
