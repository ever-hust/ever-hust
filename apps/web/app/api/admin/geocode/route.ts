import { db, jobs } from "@ever-hust/db";
import { sql } from "drizzle-orm";
import { apiSuccess, apiError } from "../../../../lib/api-response";

/**
 * POST /api/admin/geocode
 *
 * Re-geocode all jobs that have location data but no lat/lng coordinates.
 * This is an admin-only endpoint used to backfill geocoding for jobs that
 * were synced before the geocoding feature was added or when the API key
 * was not available.
 */
export async function POST() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return apiError("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured");
  }

  try {
    // Find jobs with location data but no coordinates
    const jobsToGeocode = await db
      .select({
        id: jobs.id,
        locationCity: jobs.locationCity,
        locationState: jobs.locationState,
        locationCountry: jobs.locationCountry,
      })
      .from(jobs)
      .where(
        sql`(${jobs.locationCity} IS NOT NULL OR ${jobs.locationState} IS NOT NULL OR ${jobs.locationCountry} IS NOT NULL) AND ${jobs.latitude} IS NULL`
      )
      .limit(200); // Process in batches to avoid timeout

    let geocoded = 0;
    let failed = 0;

    for (const job of jobsToGeocode) {
      const addressParts = [job.locationCity, job.locationState, job.locationCountry].filter(Boolean);
      if (addressParts.length === 0) continue;

      const address = addressParts.join(", ");

      try {
        const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        url.searchParams.set("address", address);
        url.searchParams.set("key", apiKey);

        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          failed++;
          continue;
        }

        const data = (await res.json()) as {
          status: string;
          results?: Array<{
            geometry: { location: { lat: number; lng: number } };
          }>;
        };

        if (data.status !== "OK" || !data.results?.length) {
          failed++;
          continue;
        }

        const { lat, lng } = data.results[0]!.geometry.location;

        await db
          .update(jobs)
          .set({
            latitude: String(lat),
            longitude: String(lng),
          })
          .where(sql`${jobs.id} = ${job.id}`);

        geocoded++;

        // Throttle to avoid Google Maps API rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        failed++;
      }
    }

    return apiSuccess({
      totalToGeocode: jobsToGeocode.length,
      geocoded,
      failed,
      remaining: jobsToGeocode.length - geocoded - failed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin/geocode] Failed:", msg);
    return apiError("Failed to geocode jobs");
  }
}
