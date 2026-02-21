import { task, schedules } from "@trigger.dev/sdk/v3";
import { db, jobs } from "@ever-hust/db";
import { everJobsClient } from "@ever-hust/jobs-api";
import { mapJobToDb, SEARCH_TERMS } from "./map-job";

async function syncJobs() {
  // Rotate through search terms
  const termIndex = Math.floor(Date.now() / (15 * 60 * 1000)) % SEARCH_TERMS.length;
  const searchTerm = SEARCH_TERMS[termIndex]!;

  let totalUpserted = 0;

  try {
    const response = await everJobsClient.searchJobs(
      {
        searchTerm,
        resultsWanted: 50,
        descriptionFormat: "markdown",
        distance: 50,
        country: "USA",
      },
      { pageSize: 50 }
    );

    for (const dto of response.jobs) {
      try {
        // Skip DTOs with missing required fields (defensive against malformed API responses)
        if (!dto.id || !dto.site || !dto.title) {
          console.warn(
            `[sync-jobs] Skipping job with missing required fields: id=${dto.id}, site=${dto.site}, title=${dto.title}`
          );
          continue;
        }

        const mapped = mapJobToDb(dto);

        // Atomic upsert: insert new job or update existing by externalId.
        // Eliminates the race condition from a separate SELECT + INSERT/UPDATE.
        await db
          .insert(jobs)
          .values({ ...mapped, createdAt: new Date() })
          .onConflictDoUpdate({
            target: jobs.externalId,
            set: mapped,
          });

        totalUpserted++;
      } catch (error) {
        console.error(
          `Failed to upsert job ${dto.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  } catch (error) {
    console.error(
      `Failed to sync jobs for "${searchTerm}":`,
      error instanceof Error ? error.message : error
    );
  }

  return { searchTerm, totalUpserted };
}

export const syncJobsTask = task({
  id: "sync-jobs",
  run: async () => {
    return syncJobs();
  },
});

// Run every 15 minutes
export const syncJobsSchedule = schedules.task({
  id: "sync-jobs-schedule",
  cron: "*/15 * * * *",
  run: async () => {
    return syncJobs();
  },
});
