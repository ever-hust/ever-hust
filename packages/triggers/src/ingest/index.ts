/**
 * Job-sync ingest core (spec 01a). Importable without the Trigger.dev SDK via
 * `@ever-hust/triggers/ingest` — the web route uses this entry point.
 */
import { DEFAULT_STREAM_TIMEOUT_MS, everJobsClient, type EverJobsClient } from "@ever-hust/jobs-api";
import { geocodeMaxCallsFor, readSyncEnv, type SyncEnvConfig, type SyncMode } from "./config";
import { googleGeocoderFromEnv, processGeocodeMemo } from "./geocoder";
import { processIncompleteRuns } from "./incomplete-runs";
import { processUpstreamContract } from "./upstream-contract";
import { createDrizzleJobStore, type JobStore } from "./job-store";
import type { RunSyncDeps } from "./run-sync";

export * from "./config";
export * from "./geocoder";
export * from "./job-store";
export * from "./ingestor";
export * from "./run-sync";
export * from "./route-client";
export * from "./upstream-contract";
export * from "./incomplete-runs";
export * from "./errors";

/**
 * Production wiring: the Ever Jobs client, the Drizzle store, Google from env with the per-mode
 * call cap, and the process-level geocoding memo.
 */
export function createDefaultSyncDeps(overrides: {
  client?: EverJobsClient;
  store?: JobStore;
  env?: SyncEnvConfig;
  onProgress?: RunSyncDeps["onProgress"];
  /** The run's mode (selects the Google cap). Default "full" (the higher cap). */
  mode?: SyncMode;
  /**
   * The caller's deadline (epoch ms): each upstream stream is opened with at most the time left,
   * so the run cannot outlive the caller's budget; past it, no further stream is opened.
   */
  deadlineAt?: number;
  now?: () => number;
} = {}): RunSyncDeps {
  const client = overrides.client ?? everJobsClient;
  const env = overrides.env ?? readSyncEnv();
  const now = overrides.now ?? Date.now;
  const { deadlineAt } = overrides;
  return {
    // dedup: false: Ever Jobs' own cross-source dedup merges different postings that share a
    // title; the ingestor dedupes by dedupKey instead (spec 01a D22).
    openStream: async (input) => {
      if (deadlineAt === undefined) return client.openSearchStream(input, { dedup: false });
      const left = deadlineAt - now();
      if (left <= 0) {
        throw new Error("sync deadline reached before opening the next Ever Jobs stream");
      }
      return client.openSearchStream(input, {
        dedup: false,
        timeoutMs: Math.min(left, DEFAULT_STREAM_TIMEOUT_MS),
      });
    },
    store: overrides.store ?? createDrizzleJobStore(),
    geocode: googleGeocoderFromEnv(),
    geocodeMaxCalls: geocodeMaxCallsFor(overrides.mode ?? "full", env),
    geocodeMemo: processGeocodeMemo,
    upstreamContract: processUpstreamContract,
    incompleteRuns: processIncompleteRuns,
    onProgress: overrides.onProgress,
    deadlineAt,
    now,
  };
}
