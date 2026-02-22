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
    jobLevel: dto.jobLevel ?? null,
    jobFunction: dto.jobFunction ?? null,
    companyIndustry: dto.companyIndustry ?? null,
    companyNumEmployees: dto.companyNumEmployees ?? null,
    companyDescription: dto.companyDescription ?? null,
    datePosted: safeDate(dto.datePosted),
    rawData: dto as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  };
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const addressParts = [parts.city, parts.state, parts.country].filter(Boolean);
  if (addressParts.length === 0) return null;

  const address = addressParts.join(", ");

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
      }>;
    };

    if (data.status !== "OK" || !data.results?.length) return null;

    const { lat, lng } = data.results[0]!.geometry.location;
    return { latitude: String(lat), longitude: String(lng) };
  } catch (err) {
    console.warn(
      `[geocode] Failed to geocode "${address}":`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
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
];
