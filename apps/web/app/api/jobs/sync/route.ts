import { db, jobs } from "@ever-hust/db";
import { inArray, isNotNull, and } from "drizzle-orm";
import { everJobsClient } from "@ever-hust/jobs-api";
import { mapJobToDb, geocodeLocation, SEARCH_TERMS } from "@ever-hust/triggers";
import { apiSuccess, apiError } from "../../../../lib/api-response";

/** Hard ceiling on search terms per request — each term costs a full upstream scrape. */
const MAX_SEARCH_TERMS = 5;

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
  // Guard: this triggers expensive 160+-source scraping, so it must not be open in prod.
  // When CRON_SECRET is set, require it via `Authorization: Bearer <secret>` (or x-cron-secret);
  // when unset (local dev), stay open for convenience.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      req.headers.get("x-cron-secret") ??
      "";
    if (provided !== cronSecret) {
      return apiError("Unauthorized", 401);
    }
  }
  try {
    let requestedTerms: string[] | undefined;
    let resultsWanted = 50;

    try {
      const body = await req.json();
      if (Array.isArray(body?.searchTerms)) {
        // Cap the fan-out: this was unbounded, so a single POST could request
        // arbitrarily many terms x 200 jobs, each costing a billed geocode.
        requestedTerms = body.searchTerms.slice(0, MAX_SEARCH_TERMS);
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

        // Which of these jobs do we ALREADY have coordinates for? Geocoding was
        // previously re-run for every job on every sync — measured at 88.5% of
        // calls re-resolving rows that already had lat/lng. One query replaces
        // hundreds of billed Google requests per run.
        const externalIds = response.jobs.map((d) => d.id).filter(Boolean) as string[];
        const alreadyGeocoded = new Set<string>();
        if (externalIds.length > 0) {
          const rows = await db
            .select({ externalId: jobs.externalId })
            .from(jobs)
            .where(
              and(inArray(jobs.externalId, externalIds), isNotNull(jobs.latitude)),
            );
          for (const r of rows) {
            if (r.externalId) alreadyGeocoded.add(r.externalId);
          }
        }

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

            // Geocode job location → lat/lng (non-fatal if it fails).
            // Skipped entirely when this job already has coordinates.
            const coords = alreadyGeocoded.has(dto.id)
              ? null
              : await geocodeLocation({
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
