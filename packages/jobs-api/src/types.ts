import { z } from "zod";

export const SiteEnum = z.enum([
  "linkedin",
  "indeed",
  "glassdoor",
  "ziprecruiter",
  "google",
  "bayt",
  "naukri",
  "bdjobs",
  "internshala",
  "exa",
  "upwork",
]);

export const JobTypeEnum = z.enum([
  "fulltime",
  "parttime",
  "internship",
  "contract",
]);

/**
 * Ever Jobs plugin metadata categories (contract v1 C2). Passing `siteCategories` restricts the
 * default fan-out to plugins of those categories; `siteType` still wins when given. `ats`
 * plugins additionally need a `companySlug`.
 */
export const SITE_CATEGORIES = [
  "job-board",
  "niche",
  "regional",
  "remote",
  "government",
  "freelance",
  "company",
  "ats",
] as const;
export type SiteCategory = (typeof SITE_CATEGORIES)[number];

/** Career levels produced by the Ever Jobs classifier (contract v1 C7). */
export const CAREER_LEVELS = [
  "internship",
  "new_grad",
  "entry",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "executive",
  "unknown",
] as const;
export type CareerLevelName = (typeof CAREER_LEVELS)[number];

export interface CareerLevel {
  /** One of {@link CAREER_LEVELS}; typed as string so a newer server's levels are not rejected. */
  level: string;
  confidence?: "high" | "medium" | "low" | string;
  reasons?: string[];
}

export const ScraperInputSchema = z.object({
  /** Omitted, empty or whitespace-only = list mode (contract v1 C1): no keyword filter. */
  searchTerm: z.string().optional(),
  location: z.string().optional(),
  distance: z.number().optional().default(50),
  isRemote: z.boolean().optional(),
  jobType: z.array(JobTypeEnum).optional(),
  siteType: z.array(SiteEnum).optional(),
  companySlug: z.string().optional(),
  resultsWanted: z.number().optional().default(15),
  offset: z.number().optional(),
  hoursOld: z.number().optional(),
  country: z.string().optional().default("USA"),
  descriptionFormat: z.enum(["markdown", "html", "plain"]).optional(),
  easyApply: z.boolean().optional(),
  enforceAnnualSalary: z.boolean().optional(),
  linkedinFetchDescription: z.boolean().optional(),
  linkedinCompanyIds: z.array(z.string()).optional(),
  /** Restrict the default fan-out to these plugin categories (contract v1 C2). */
  siteCategories: z.array(z.enum(SITE_CATEGORIES)).optional(),
  /** Server-side filter on the classified career level (contract v1 C7). */
  careerLevels: z.array(z.enum(CAREER_LEVELS)).optional(),
});

export type ScraperInput = z.infer<typeof ScraperInputSchema>;

export interface JobPostDto {
  id: string;
  site: string;
  title: string;
  companyName?: string;
  companyUrl?: string;
  companyLogo?: string;
  jobUrl?: string;
  jobUrlDirect?: string;
  applyUrl?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  isRemote?: boolean;
  jobType?: string[];
  compensation?: {
    interval?: string;
    minAmount?: number;
    maxAmount?: number;
    currency?: string;
  };
  description?: string;
  datePosted?: string;
  /** When the posting expires / was last seen live (ISO), if the source provides it. */
  expiresAt?: string;
  /**
   * Optional liveness signal from the Ever Jobs corpus (spec #4 / #7). Forward-compatible:
   * Hust tolerates its absence and derives freshness from dates when not provided.
   */
  liveness?: {
    state?: "active" | "expired" | "uncertain";
    checkedAt?: string;
  };
  /**
   * Optional posting-legitimacy / ghost-job signal from the Ever Jobs corpus (spec #7).
   * Forward-compatible: Hust derives a heuristic when absent. Orthogonal to the fit score.
   */
  legitimacy?: {
    state?: "verified" | "likely" | "uncertain";
    reasons?: string[];
  };
  emails?: string[];
  skills?: string[];
  department?: string;
  team?: string;
  employmentType?: string;
  jobLevel?: string;
  jobFunction?: string;
  companyIndustry?: string;
  companyNumEmployees?: string;
  companyDescription?: string;
  /**
   * Stable cross-source canonical key from the Ever Jobs dedup engine (contract v1 C9). The same
   * posting seen through different sources or runs carries the same key. Opaque to Hust.
   */
  dedupKey?: string;
  /** Deterministic career-level classification (contract v1 C7). */
  careerLevel?: CareerLevel;
}

// ---------------------------------------------------------------------------
// Runtime validation of streamed jobs
// ---------------------------------------------------------------------------

/** Optional string: a malformed value is dropped (→ undefined) instead of rejecting the job. */
const optStr = z.string().optional().catch(undefined);
const optBool = z.boolean().optional().catch(undefined);
const optStrArr = z.array(z.string()).optional().catch(undefined);
const optNum = z.number().optional().catch(undefined);
/** Required, non-blank string — validated but kept verbatim (no trimming transform). */
const nonBlank = z.string().refine((s) => s.trim().length > 0, "must be a non-blank string");

/**
 * Runtime schema for one job on the wire. Only `id`, `site` and `title` are required (they are the
 * NOT NULL columns Hust stores); every optional field that is malformed is dropped rather than
 * failing the whole job, and unknown fields are kept (`passthrough`) so `raw_data` stays complete.
 */
export const JobPostSchema = z
  .object({
    id: nonBlank,
    site: nonBlank,
    title: nonBlank,
    companyName: optStr,
    companyUrl: optStr,
    companyLogo: optStr,
    jobUrl: optStr,
    jobUrlDirect: optStr,
    applyUrl: optStr,
    location: z
      .object({ city: optStr, state: optStr, country: optStr })
      .passthrough()
      .optional()
      .catch(undefined),
    isRemote: optBool,
    jobType: optStrArr,
    compensation: z
      .object({ interval: optStr, minAmount: optNum, maxAmount: optNum, currency: optStr })
      .passthrough()
      .optional()
      .catch(undefined),
    description: optStr,
    datePosted: optStr,
    expiresAt: optStr,
    liveness: z
      .object({
        state: z.enum(["active", "expired", "uncertain"]).optional().catch(undefined),
        checkedAt: optStr,
      })
      .passthrough()
      .optional()
      .catch(undefined),
    legitimacy: z
      .object({
        state: z.enum(["verified", "likely", "uncertain"]).optional().catch(undefined),
        reasons: optStrArr,
      })
      .passthrough()
      .optional()
      .catch(undefined),
    emails: optStrArr,
    skills: optStrArr,
    department: optStr,
    team: optStr,
    employmentType: optStr,
    jobLevel: optStr,
    jobFunction: optStr,
    companyIndustry: optStr,
    companyNumEmployees: optStr,
    companyDescription: optStr,
    dedupKey: nonBlank.optional().catch(undefined),
    careerLevel: z
      .object({ level: z.string().min(1), confidence: optStr, reasons: optStrArr })
      .passthrough()
      .optional()
      .catch(undefined),
  })
  .passthrough();

/** Validate one wire job: the typed job, or the first validation issue as `reason`. */
export function parseJobPost(
  value: unknown,
): { ok: true; job: JobPostDto } | { ok: false; reason: string } {
  const parsed = JobPostSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, job: stripUndefined(parsed.data) as unknown as JobPostDto };
  }
  const issue = parsed.error.issues[0];
  return {
    ok: false,
    reason: issue ? `${issue.path.join(".") || "job"}: ${issue.message}` : "invalid job",
  };
}

/** Drop keys whose value is `undefined` (left behind by `.catch(undefined)`), one level deep. */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export interface JobSearchResponse {
  count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  cached: boolean;
  jobs: JobPostDto[];
}
