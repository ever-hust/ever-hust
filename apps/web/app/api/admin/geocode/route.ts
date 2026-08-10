import { db, jobs } from "@ever-hust/db";
import { sql } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";
import { mapsServerKey } from "../../../../lib/maps-key";

/**
 * POST /api/admin/geocode
 *
 * Re-geocode all jobs that have location data but no lat/lng coordinates.
 * This is an admin-only endpoint used to backfill geocoding for jobs that
 * were synced before the geocoding feature was added or when the API key
 * was not available.
 *
 * Each call can fan out to `limit` Google Geocoding requests, so it is gated
 * behind `requireRole("admin")` + the `adminWrite` rate limit like every other
 * /api/admin/* route. It was unauthenticated until 2026-08-11.
 */
export async function POST() {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "adminWrite");
  if (rateLimited) return rateLimited;

  const apiKey = mapsServerKey();
  if (!apiKey) {
    return apiError("GOOGLE_MAPS_SERVER_KEY is not configured");
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
      .limit(25); // Process in small batches — each row costs one billed Google request

    let geocoded = 0;
    let failed = 0;
    // Google's failure statuses are per-project, not per-address: once the daily
    // quota trips, every remaining row in the batch fails identically. Bail out
    // rather than burning the whole batch against a wall.
    let consecutiveFailures = 0;
    const statusCounts: Record<string, number> = {};

    // Memoise within the batch — the corpus repeats the same "city, state, country"
    // roughly 3.6x, and each repeat would otherwise be a separate billed request.
    const cache = new Map<string, { lat: number; lng: number } | null>();

    for (const job of jobsToGeocode) {
      if (consecutiveFailures >= 3) {
        console.warn(
          `[api/admin/geocode] Aborting batch after ${consecutiveFailures} consecutive failures; statuses=${JSON.stringify(statusCounts)}`
        );
        break;
      }

      const addressParts = [job.locationCity, job.locationState, job.locationCountry].filter(Boolean);
      if (addressParts.length === 0) continue;

      const address = addressParts.join(", ");

      const cached = cache.get(address);
      if (cached !== undefined) {
        if (cached === null) {
          failed++;
          continue;
        }
        await db
          .update(jobs)
          .set({ latitude: String(cached.lat), longitude: String(cached.lng) })
          .where(sql`${jobs.id} = ${job.id}`);
        geocoded++;
        continue;
      }

      try {
        // Throttle FIRST. This used to sit after `geocoded++`, so every failure
        // path `continue`d straight past it — a 100%-failing batch ran completely
        // unthrottled, which is the opposite of what a rate-limit guard is for.
        await new Promise((resolve) => setTimeout(resolve, 100));

        const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        url.searchParams.set("address", address);
        url.searchParams.set("key", apiKey);

        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          statusCounts[`HTTP_${res.status}`] = (statusCounts[`HTTP_${res.status}`] ?? 0) + 1;
          console.warn(`[api/admin/geocode] HTTP ${res.status} for "${address}"`);
          cache.set(address, null);
          failed++;
          consecutiveFailures++;
          continue;
        }

        const data = (await res.json()) as {
          status: string;
          error_message?: string;
          results?: Array<{
            geometry: { location: { lat: number; lng: number } };
          }>;
        };

        if (data.status !== "OK" || !data.results?.length) {
          statusCounts[data.status] = (statusCounts[data.status] ?? 0) + 1;
          console.warn(
            `[api/admin/geocode] ${data.status} for "${address}"${data.error_message ? `: ${data.error_message}` : ""}`
          );
          cache.set(address, null);
          failed++;
          consecutiveFailures++;
          continue;
        }

        const { lat, lng } = data.results[0]!.geometry.location;
        cache.set(address, { lat, lng });
        consecutiveFailures = 0;

        await db
          .update(jobs)
          .set({
            latitude: String(lat),
            longitude: String(lng),
          })
          .where(sql`${jobs.id} = ${job.id}`);

        geocoded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        statusCounts.EXCEPTION = (statusCounts.EXCEPTION ?? 0) + 1;
        console.warn(`[api/admin/geocode] exception for "${address}": ${msg}`);
        cache.set(address, null);
        failed++;
        consecutiveFailures++;
      }
    }

    return apiSuccess({
      totalToGeocode: jobsToGeocode.length,
      geocoded,
      failed,
      remaining: jobsToGeocode.length - geocoded - failed,
      // Surface Google's actual verdict — the previous version discarded it, which
      // is why 8 weeks of 100% failure produced zero diagnosable log output.
      statusCounts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin/geocode] Failed:", msg);
    return apiError("Failed to geocode jobs");
  }
}
