import { db, jobs } from "@ever-hust/db";
import { everJobsClient } from "@ever-hust/jobs-api";
import { mapJobToDb, geocodeLocation, SEARCH_TERMS } from "@ever-hust/triggers";
import { apiSuccess, apiError } from "../../../../lib/api-response";

/**
 * POST /api/jobs/sync
 *
 * Manual trigger to populate the local jobs table from the Ever Jobs API.
 * Mirrors the Trigger.dev sync-jobs task for local development.
 *
 * Optional body: { searchTerms?: string[], resultsWanted?: number }
 *   - searchTerms: override the default rotation
 *   - resultsWanted: number of results per search term (default 50)
 */
export async function POST(req: Request) {
  try {
    let requestedTerms: string[] | undefined;
    let resultsWanted = 50;

    try {
      const body = await req.json();
      if (Array.isArray(body?.searchTerms)) {
        requestedTerms = body.searchTerms;
      }
      if (typeof body?.resultsWanted === "number" && body.resultsWanted > 0) {
        resultsWanted = Math.min(body.resultsWanted, 200);
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    // Use requested terms, or pick the current rotation term
    const terms = requestedTerms ?? [
      SEARCH_TERMS[
        Math.floor(Date.now() / (15 * 60 * 1000)) % SEARCH_TERMS.length
      ]!,
    ];

    let totalUpserted = 0;
    const errors: string[] = [];

    for (const searchTerm of terms) {
      try {
        const response = await everJobsClient.searchJobs(
          {
            searchTerm,
            resultsWanted,
            descriptionFormat: "markdown",
            distance: 50,
            country: "USA",
          },
          { pageSize: resultsWanted },
        );

        for (const dto of response.jobs) {
          try {
            // Skip DTOs with missing required fields
            if (!dto.id || !dto.site || !dto.title) {
              console.warn(
                `[sync] Skipping job with missing required fields: id=${dto.id}, site=${dto.site}, title=${dto.title}`,
              );
              continue;
            }

            const mapped = mapJobToDb(dto);

            // Geocode job location → lat/lng (non-fatal if it fails)
            const coords = await geocodeLocation({
              city: mapped.locationCity,
              state: mapped.locationState,
              country: mapped.locationCountry,
            });

            await db
              .insert(jobs)
              .values({
                ...mapped,
                ...(coords ?? {}),
                createdAt: new Date(),
              })
              .onConflictDoUpdate({
                target: jobs.externalId,
                set: { ...mapped, ...(coords ?? {}) },
              });

            totalUpserted++;
          } catch (error) {
            const msg = `Failed to upsert job ${dto.id}: ${error instanceof Error ? error.message : error}`;
            console.error(`[sync] ${msg}`);
            errors.push(msg);
          }
        }
      } catch (error) {
        const msg = `Failed to sync "${searchTerm}": ${error instanceof Error ? error.message : error}`;
        console.error(`[sync] ${msg}`);
        errors.push(msg);
      }
    }

    return apiSuccess({
      searchTerms: terms,
      totalUpserted,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error(
      "[api/jobs/sync] Sync failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to sync jobs. Check server logs.");
  }
}
