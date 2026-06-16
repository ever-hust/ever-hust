import { task, schedules } from "@trigger.dev/sdk";
import { db, jobs } from "@ever-hust/db";
import { everJobsClient } from "@ever-hust/jobs-api";
import { mapJobToDb, geocodeLocation, SEARCH_TERMS } from "./map-job";
import { runsOnTrigger, SKIPPED } from "./scheduler";

/**
 * Portable sync trigger: POST the app's own /api/jobs/sync endpoint so the sync executes in the
 * app's runtime — which can reach the Ever Jobs API (including an internal/ClusterIP one) wherever
 * the app is deployed (k8s, Vercel, …). Used by the Trigger.dev schedule; an external scheduler
 * (k8s CronJob / Vercel Cron) hits the same endpoint directly.
 */
async function triggerRemoteSync(): Promise<{ ok: boolean; status: number }> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8443";
  const secret = process.env.CRON_SECRET;
  const res = await fetch(`${base}/api/jobs/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ resultsWanted: 80 }),
  });
  return { ok: res.ok, status: res.status };
}

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

        // Geocode job location → lat/lng (non-fatal if it fails)
        const coords = await geocodeLocation({
          city: mapped.locationCity,
          state: mapped.locationState,
          country: mapped.locationCountry,
        });

        // Atomic upsert: insert new job or update existing by externalId.
        // Eliminates the race condition from a separate SELECT + INSERT/UPDATE.
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

// Direct in-process sync (kept for in-cluster/manual runs where this code can reach Ever Jobs).
export const syncJobsTask = task({
  id: "sync-jobs",
  run: async () => {
    return syncJobs();
  },
});

// Scheduled sync. When Trigger.dev is the active scheduler it delegates to the app's HTTP
// endpoint (portable — runs in the app's runtime, which can reach Ever Jobs); under SCHEDULER=cron
// an external scheduler (k8s CronJob / Vercel Cron) hits the same endpoint and this no-ops.
export const syncJobsSchedule = schedules.task({
  id: "sync-jobs-schedule",
  cron: "*/15 * * * *",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return triggerRemoteSync();
  },
});
