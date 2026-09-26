import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Every environment variable the job sync reads must be declared in turbo.json `globalEnv`.
 * Turborepo 2 runs tasks in strict env mode: an undeclared variable is not passed to a task run
 * through turbo (and is not part of its cache key), so a sync setting that works under `node` or
 * jest silently falls back to its default under `turbo run dev` / `build`. The sync reads its
 * settings from the process env (`process.env.X`) or from an env record (`env.X`, readSyncEnv).
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");

/** The sync's code path: the Ever Jobs client, the ingest core, the tasks, the route. */
const SYNC_SOURCES = [
  "packages/jobs-api/src",
  "packages/triggers/src/ingest",
  "packages/triggers/src/sync-jobs.ts",
  "packages/triggers/src/sync-runner.ts",
  "packages/triggers/src/scheduler.ts",
  "packages/triggers/src/map-job.ts",
  "apps/web/lib/jobs-sync-route.ts",
  "apps/web/lib/cron-auth.ts",
];

const ENV_READ = /\b(?:process\.)?env\.([A-Z][A-Z0-9_]*)\b/g;

function sourceFiles(entry: string): string[] {
  const full = path.join(REPO_ROOT, entry);
  if (fs.statSync(full).isFile()) return [full];
  return fs
    .readdirSync(full, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && /\.ts$/.test(d.name) && !/\.test\.ts$/.test(d.name))
    .map((d) => path.join(d.parentPath, d.name));
}

function envReads(files: string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    for (const m of fs.readFileSync(file, "utf8").matchAll(ENV_READ)) names.add(m[1]!);
  }
  return names;
}

describe("the job sync's environment is declared to turbo", () => {
  const files = SYNC_SOURCES.flatMap(sourceFiles);
  const reads = envReads(files);
  const turbo = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "turbo.json"), "utf8")) as { globalEnv: string[] };

  it("scans the real sources (control: known reads are found)", () => {
    expect(files.length).toBeGreaterThan(10);
    for (const known of ["EVER_JOBS_API_URL", "EVER_JOBS_API_KEY", "EVER_JOBS_FETCH_TIMEOUT_MS", "JOBS_SYNC_FULL_ENABLED", "CRON_SECRET"]) {
      expect(reads).toContain(known);
    }
  });

  it("every variable the sync reads is in turbo.json globalEnv", () => {
    const missing = [...reads].filter((name) => !turbo.globalEnv.includes(name)).sort();
    expect(missing).toEqual([]);
  });
});
