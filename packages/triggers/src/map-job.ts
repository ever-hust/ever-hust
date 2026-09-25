import type { JobPostDto } from "@ever-hust/jobs-api";

/**
 * Map an API JobPostDto to our DB jobs schema.
 *
 * This is a pure transformation extracted from sync-jobs.ts for testability.
 * Handles null/undefined coalescing for every optional DTO field.
 */
export function mapJobToDb(dto: JobPostDto) {
  return {
    externalId: dto.id,
    site: dto.site,
    title: dto.title,
    companyName: dto.companyName ?? null,
    companyUrl: dto.companyUrl ?? null,
    companyLogo: dto.companyLogo ?? null,
    jobUrl: dto.jobUrl ?? null,
    jobUrlDirect: dto.jobUrlDirect ?? null,
    applyUrl: dto.applyUrl ?? null,
    locationCity: dto.location?.city ?? null,
    locationState: dto.location?.state ?? null,
    locationCountry: dto.location?.country ?? null,
    isRemote: dto.isRemote ?? false,
    jobType: dto.jobType ?? [],
    salaryMin: safeNumericString(dto.compensation?.minAmount),
    salaryMax: safeNumericString(dto.compensation?.maxAmount),
    salaryCurrency: dto.compensation?.currency ?? null,
    salaryInterval: dto.compensation?.interval ?? null,
    description: dto.description ?? null,
    skills: dto.skills ?? [],
    department: dto.department ?? null,
    team: dto.team ?? null,
    employmentType: dto.employmentType ?? null,
    // Contract v1 C7: the deterministic Ever Jobs classification wins over the source's own
    // free-text level — except "unknown", which defers to whatever the source said.
    jobLevel: resolveJobLevel(dto),
    jobFunction: dto.jobFunction ?? null,
    companyIndustry: dto.companyIndustry ?? null,
    companyNumEmployees: dto.companyNumEmployees ?? null,
    companyDescription: dto.companyDescription ?? null,
    datePosted: safeDate(dto.datePosted),
    expiresAt: safeDate(dto.expiresAt),
    // Corpus signals (spec #4 / #7) — opt-in upstream; null when the source omits them.
    liveness: dto.liveness?.state ?? null,
    legitimacy: dto.legitimacy?.state ?? null,
    legitimacyReasons: dto.legitimacy?.reasons ?? null,
    rawData: dto as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  };
}

/**
 * `job_level` for a DTO: `careerLevel.level` (contract v1 C7) when present and informative,
 * else the source `jobLevel`, else null. `careerLevel` and `dedupKey` themselves stay in
 * `raw_data` (the DTO is stored verbatim).
 */
export function resolveJobLevel(dto: Pick<JobPostDto, "careerLevel" | "jobLevel">): string | null {
  const classified = dto.careerLevel?.level?.trim().toLowerCase();
  if (classified && classified !== "unknown") return classified;
  return dto.jobLevel ?? null;
}

/** Convert a number to string for PostgreSQL numeric columns, returning null for NaN/Infinity/negative/undefined. */
function safeNumericString(value: number | undefined | null): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value.toString();
}

/** Parse a date string, returning null for invalid or unparseable dates. */
function safeDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Geocode city / state / country to lat/lng via Google Maps Geocoding REST API.
 *
 * Returns `{ latitude, longitude }` as strings (for Postgres numeric columns)
 * or `null` if the API key is not set, the address is empty, or geocoding fails.
 *
 * Failures are non-fatal — the caller should merge the result only when non-null.
 */
export async function geocodeLocation(parts: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): Promise<{ latitude: string; longitude: string } | null> {
  // Server key ONLY. Never `NEXT_PUBLIC_*` — Next inlines that prefix into the
  // client bundle at build time, which is how the previous key became public.
  // See apps/web/lib/maps-key.ts for the full split.
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return null;

  const addressParts = [parts.city, parts.state, parts.country].filter(Boolean);
  if (addressParts.length === 0) return null;

  const address = addressParts.join(", ");

  const cached = geocodeCache.get(address);
  if (cached !== undefined) return cached;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`[geocode] HTTP ${res.status} for "${address}"`);
      cacheResult(address, null);
      return null;
    }

    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
      }>;
    };

    if (data.status !== "OK" || !data.results?.length) {
      // Previously this returned null silently. Google's status is the ONLY
      // signal distinguishing "no such place" (ZERO_RESULTS) from "your project
      // is broken" (REQUEST_DENIED / OVER_QUERY_LIMIT) — swallowing it hid an
      // 8-week, 100%-failure outage behind zero log lines.
      console.warn(
        `[geocode] ${data.status} for "${address}"${data.error_message ? `: ${data.error_message}` : ""}`
      );
      cacheResult(address, null);
      return null;
    }

    const { lat, lng } = data.results[0]!.geometry.location;
    const result = { latitude: String(lat), longitude: String(lng) };
    cacheResult(address, result);
    return result;
  } catch (err) {
    console.warn(
      `[geocode] Failed to geocode "${address}":`,
      err instanceof Error ? err.message : err
    );
    cacheResult(address, null);
    return null;
  }
}

/**
 * Process-local address -> coords cache.
 *
 * The job corpus repeats the same "city, state, country" about 3.6x, and the
 * sync loop previously issued one billed Google request per job with no reuse.
 * Bounded so a long-lived worker cannot grow it without limit.
 */
const GEOCODE_CACHE_MAX = 5000;
const geocodeCache = new Map<string, { latitude: string; longitude: string } | null>();

function cacheResult(
  address: string,
  value: { latitude: string; longitude: string } | null
): void {
  if (geocodeCache.size >= GEOCODE_CACHE_MAX) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest !== undefined) geocodeCache.delete(oldest);
  }
  geocodeCache.set(address, value);
}

/**
 * Search terms used for job sync rotation.
 * Exported for validation testing.
 */
export const SEARCH_TERMS = [
  // Engineering
  "software engineer",
  "frontend developer",
  "backend developer",
  "full stack developer",
  "mobile developer",
  "devops engineer",
  "site reliability engineer",
  "platform engineer",
  "cloud engineer",
  "security engineer",
  "embedded engineer",
  "QA engineer",
  // Data & AI
  "data scientist",
  "data engineer",
  "machine learning engineer",
  "AI engineer",
  "data analyst",
  "business intelligence analyst",
  // Product & Design
  "product manager",
  "product designer",
  "UX designer",
  "UI designer",
  "UX researcher",
  "graphic designer",
  // Leadership
  "engineering manager",
  "VP of engineering",
  "CTO",
  "technical lead",
  "director of product",
  // Business & Operations
  "marketing manager",
  "sales engineer",
  "solutions architect",
  "technical writer",
  "project manager",
  "scrum master",
  // Emerging
  "blockchain developer",
  "web3 engineer",
  "AR/VR developer",
  "robotics engineer",
  "computer vision engineer",
  // Early career — internships, new grad, entry level (many boards only surface these for an
  // explicit keyword)
  "software engineer intern",
  "software engineering internship",
  "new grad software engineer",
  "entry level software engineer",
  "junior software engineer",
  "machine learning intern",
  "data science intern",
  "AI engineer new grad",
  "research scientist intern",
  // Quantitative finance
  "quantitative researcher",
  "quantitative trader",
  "quantitative trader intern",
  "quantitative developer",
  "quantitative analyst",
];
