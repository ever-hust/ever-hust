import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SyncMode } from "@ever-hust/triggers/ingest";

/**
 * A file per job-sync run in flight, so the container can tell without HTTP that a sync is
 * running (handover H-12 / FS-5): Next.js exits at once on SIGTERM, and a hust-web rollout during
 * a full sync kills the run. The deployment's `preStop` hook waits while a marker exists, e.g.
 *
 *   sh -c 'i=0; while ls /tmp/hust-jobs-sync-inflight-* >/dev/null 2>&1 && [ "$i" -lt 3540 ]; do sleep 5; i=$((i+5)); done'
 *
 * (with `terminationGracePeriodSeconds` above the wait). The route creates
 * `${os.tmpdir()}/hust-jobs-sync-inflight-<mode>` when it takes a mode's single-flight slot and
 * removes it where it frees the slot, only if the file still holds this run's token (a run that
 * outlived its slot must not delete the next run's marker).
 *
 * Best effort: a marker that cannot be written or removed is a `console.warn`, never a failed or
 * delayed sync. The calls are synchronous on purpose: a tiny file in the container's own `/tmp`,
 * and a create can never be overtaken by its own remove (an async pair could leave a marker behind
 * for a run that already ended, and the preStop hook would then wait its whole bound). A marker
 * cannot outlive its process: a restarted container starts from a fresh writable layer.
 */

export const IN_FLIGHT_MARKER_PREFIX = "hust-jobs-sync-inflight-";

/** `<dir>/hust-jobs-sync-inflight-<mode>`. */
export function inFlightMarkerPath(mode: SyncMode, dir: string = tmpdir()): string {
  return join(dir, `${IN_FLIGHT_MARKER_PREFIX}${mode}`);
}

export interface InFlightMarker {
  /** A run of `mode` took its slot. Never throws. */
  create(mode: SyncMode, token: string, startedAt: number): void;
  /** That run freed its slot: remove the marker if it is still this run's. Never throws. */
  remove(mode: SyncMode, token: string): void;
}

/** The marker's contents: the start time (ISO 8601 UTC) and the run's token, on one line. */
export function inFlightMarkerContents(token: string, startedAt: number): string {
  return `${new Date(startedAt).toISOString()} ${token}\n`;
}

function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Markers as files in `dir` (default `os.tmpdir()`, `/tmp` in the image). */
export function fileInFlightMarker(
  dir: string = tmpdir(),
  warn: (message: string) => void = (m) => console.warn(m),
): InFlightMarker {
  return {
    create(mode, token, startedAt) {
      const path = inFlightMarkerPath(mode, dir);
      try {
        writeFileSync(path, inFlightMarkerContents(token, startedAt), { encoding: "utf8", mode: 0o644 });
      } catch (err) {
        warn(`[api/jobs/sync] could not write the in-flight marker ${path} (the sync runs anyway): ${String(err)}`);
      }
    },
    remove(mode, token) {
      const path = inFlightMarkerPath(mode, dir);
      try {
        const [, owner] = readFileSync(path, "utf8").trim().split(/\s+/);
        if (owner !== token) return; // another run's marker (this one outlived its slot)
        unlinkSync(path);
      } catch (err) {
        if (errorCode(err) === "ENOENT") return; // already gone (or never written)
        warn(`[api/jobs/sync] could not remove the in-flight marker ${path}: ${String(err)}`);
      }
    },
  };
}

/** For callers that want no marker. */
export const NO_IN_FLIGHT_MARKER: InFlightMarker = { create: () => {}, remove: () => {} };

/** Run a marker call without ever letting it throw into the sync (a custom marker might). */
export function safely(run: () => void, warn: (message: string) => void = (m) => console.warn(m)): void {
  try {
    run();
  } catch (err) {
    warn(`[api/jobs/sync] in-flight marker failed (ignored): ${String(err)}`);
  }
}
