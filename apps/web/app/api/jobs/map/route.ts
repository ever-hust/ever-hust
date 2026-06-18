import { db } from "@ever-hust/db";
import { jobs } from "@ever-hust/db";
import { and, desc, isNotNull } from "drizzle-orm";
import { jobSearchParamsSchema } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError } from "../../../../lib/api-response";
import { getSessionUser } from "../../../../lib/get-session-user";
import {
  buildJobFilterConditions,
  hiddenJobsExclusion,
} from "../../../../lib/job-search-filters";

/**
 * Geo points for the FULL set of jobs matching the current filters/search —
 * not just the current page. The map clusters these client-side, so the user
 * sees every matching job (e.g. all 2,378), zooming in to reveal individual
 * pins. Capped for safety; the clusterer handles thousands of points.
 */
const MAP_CAP = 5000;

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(ip, "publicHighThroughput");
  if (rateLimited) return rateLimited;

  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = jobSearchParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return apiBadRequest("Invalid search parameters", parsed.error.flatten().fieldErrors);
  }

  const { keywords, location, isRemote, jobType, salaryMin, salaryMax } = parsed.data;

  try {
    const user = await getSessionUser();

    const conditions = buildJobFilterConditions({
      keywords,
      location,
      isRemote,
      jobType,
      salaryMin,
      salaryMax,
    });
    // Only geocoded jobs can appear on the map.
    conditions.push(isNotNull(jobs.latitude), isNotNull(jobs.longitude));
    if (user) conditions.push(hiddenJobsExclusion(user.id));

    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        companyName: jobs.companyName,
        locationCity: jobs.locationCity,
        locationState: jobs.locationState,
        locationCountry: jobs.locationCountry,
        isRemote: jobs.isRemote,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        salaryCurrency: jobs.salaryCurrency,
        salaryInterval: jobs.salaryInterval,
        latitude: jobs.latitude,
        longitude: jobs.longitude,
      })
      .from(jobs)
      .where(and(...conditions))
      .orderBy(desc(jobs.datePosted))
      .limit(MAP_CAP + 1);

    const capped = rows.length > MAP_CAP;
    const points = capped ? rows.slice(0, MAP_CAP) : rows;

    return apiSuccess(
      { points, count: points.length, capped },
      user ? undefined : { cacheSeconds: 120 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/jobs/map] Database query failed:", msg);
    return apiError("Failed to load map jobs. Please try again.");
  }
}
