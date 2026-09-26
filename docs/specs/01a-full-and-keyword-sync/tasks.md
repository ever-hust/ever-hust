# Tasks: 01a — Full + keyword job sync

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Client (`packages/jobs-api`)

- [x] T01 — NDJSON line reader + zod job schema
  - **Files:** `packages/jobs-api/src/ndjson.ts`, `packages/jobs-api/src/types.ts`
  - **Acceptance:** chunk-boundary, multi-byte and CRLF handling; blank lines skipped; oversize
    line rejected; `JobPostSchema` requires `id`/`site`/`title`, tolerates malformed optional
    fields, keeps unknown fields.
  - **Estimate:** 0.5 day

- [x] T02 — Streaming search + legacy JSON fallback + signals default off
  - **Files:** `packages/jobs-api/src/index.ts`, `packages/jobs-api/src/stream.test.ts`,
    `packages/jobs-api/src/client.test.ts`
  - **Acceptance:** `openSearchStream` / `streamSearchJobs` yield `progress`/`job`/`invalid`/`end`;
    `TruncatedStreamError` on missing `end` and on an `error` line; unknown types ignored;
    `application/json` bodies (array or `{jobs}`) adapted; blank `searchTerm` omitted;
    `siteCategories` sent; liveness/legitimacy only with `EVER_JOBS_REQUEST_SIGNALS=true`.
  - **Estimate:** 1 day

## Phase 2 — Ingest core (`packages/triggers`)

- [x] T03 — Modes, env parsing, rotation, new search terms, career-level mapping
  - **Files:** `packages/triggers/src/ingest/config.ts`, `packages/triggers/src/map-job.ts`
  - **Acceptance:** `full` / `keywords` plans match the spec defaults; env overrides parsed and
    clamped; rotation deterministic and covers the new intern/new-grad/quant terms;
    `job_level ← careerLevel.level` unless `unknown`.
  - **Estimate:** 0.5 day

- [x] T04 — Run geocoder
  - **Files:** `packages/triggers/src/ingest/geocoder.ts`
  - **Acceptance:** memo per normalised location; one reuse query per batch for unresolved keys;
    Google stopped after `OVER_QUERY_LIMIT`/`REQUEST_DENIED`; per-run call cap; counters.
  - **Estimate:** 0.5 day

- [x] T05 — Job store + ingestor + run orchestration
  - **Files:** `packages/triggers/src/ingest/job-store.ts`, `ingestor.ts`, `run-sync.ts`
  - **Acceptance:** batches of 250; one bulk upsert per batch with the skip-unchanged `WHERE`
    (asserted on the generated SQL); row-by-row fallback on batch failure; within-run and
    cross-run dedupe; counters and one summary log line; `ok:false` on truncation/open failure.
  - **Estimate:** 1 day

## Phase 3 — Route + schedules

- [x] T06 — Streaming `/api/jobs/sync`
  - **Files:** `apps/web/lib/jobs-sync-route.ts`, `apps/web/app/api/jobs/sync/route.ts`
  - **Acceptance:** 401/400/502 before streaming; NDJSON `start` → `progress`* → `summary`;
    heartbeat ≤ 10 s; `ok:false` on a truncated stream.
  - **Estimate:** 0.5 day

- [x] T07 — Trigger schedules
  - **Files:** `packages/triggers/src/sync-jobs.ts`
  - **Acceptance:** keywords `*/15`, full `20 */6 * * *` (maxDuration 3600, queue concurrency 1);
    both parse the summary and throw on `ok:false` / missing summary / non-2xx.
  - **Estimate:** 0.5 day

- [x] T08 — `NULLS LAST` on `/api/jobs/search`
  - **Files:** `apps/web/app/api/jobs/search/route.ts`
  - **Estimate:** 0.1 day

## Phase 4 — Docs

- [x] T09 — `.env.example`, `turbo.json` `globalEnv`, spec status, signals-default notes in specs 04/07
  - **Estimate:** 0.25 day

## Phase 5 — Review fixes (2026-09-25)

- [x] T10 — Content-preserving cross-run merges (D2 revised): stale-owner takeover only,
  `mergedWrites` counter; Postgres test A, B, A, B keeps `xmin` stable.
- [x] T11 — Sticky liveness / legitimacy columns when signals were not requested (D16).
- [x] T12 — Two-step dedup probe: no `raw_data` read for whole companies (D1).
- [x] T13 — Process-level geocoding memo + keyword-run Google cap (FR-8, D17).
- [x] T14 — No retries on the streaming open (`jobs-api`).
- [x] T15 — Full mode gated on Ever Jobs contract v1; legacy keyword count 80 (D18, D13 corrected).
- [x] T16 — Route: single flight per mode (409), caller deadline, `resultsWanted` ≤ 1000,
  keywords-only fields rejected in full mode (FR-11, §7.2, D11).
- [x] T17 — Deployment notes: producer fan-out deadline, serverless `maxDuration` (D19).
- [x] T18 — Route: every run has a budget (2 h without `deadlineMs`); a slot still held 10 min
  past its deadline is stale, so a hung run cannot block its mode until restart (D11).

## Phase 6 — Rebase onto develop `e551cef` + review fixes (2026-09-25)

- [x] T19 — Jobs-writer rule for the batch upsert: `withBoundedJobsInsert` + `JOBS_CREATED_AT`,
  ≤ 250 rows per statement; the source guard passes with no exception (FR-7, D20).
- [x] T20 — `/api/jobs/sync` guarded by the shared `verifyCronRequest` (constant time, fail closed
  in production) (FR-11).
- [x] T21 — `turbo.json` `globalEnv` declares every env var the sync reads, with a test that scans
  the sync's sources.
- [x] T22 — End-line crawl completeness: `complete` / `stopReason` / `sourcesSkipped` /
  `sourcesFailed` in the summary; a partial crawl is ok, warned about, never thrown (FR-9, FR-12,
  D21).
- [x] T23 — `dedup=false` on every streaming request; within-run dedupe by `dedupKey`, with a
  company + title + location fallback for keyless jobs (FR-6, D22).

## Phase 7 — Review + real-data E2E fixes (2026-09-26)

- [x] T24 — One source's two ids with one `dedupKey` stay two rows, within a run and across runs
  (the probe reads `site` and `raw_data->>'id'`); an existing `external_id` is always written under
  itself even when another source's copy streamed first; probe cache capped at 50 k rows (FR-6,
  NFR-1, D23).
- [x] T25 — Upsert `WHERE` read ahead: unchanged rows never reach the INSERT (no lock, no WAL);
  the weekly last-seen refresh is a narrow `UPDATE … SET updated_at` (FR-7, NFR-2, D24).
- [x] T26 — Every read and the refresh bounded by `SET LOCAL` timeouts; the row-by-row fallback stops
  after 5 failures in a row or past the run's deadline; short driver messages instead of Drizzle's
  full-query wrapper (FR-7, NFR-3, D25).
- [x] T27 — Stored coordinates: two targeted scans per run, then one load of every stored location
  (FR-8, D26).
- [x] T28 — Escalation after 4 incomplete full runs in a row: error line, `incompleteStreak`, the
  full task throws (FR-9, FR-12, D27). Superseded by T31: the count is per pod and per restart.
- [x] T29 — Tests: the content columns pinned literally; Postgres tests for a description-only
  change, row locks (`xmax`), the narrow refresh (TOAST/WAL), a read under a lock; CI runs the
  Postgres test in the E2E job; the branch history squashed so every commit follows the jobs-writer
  rule.

## Phase 8 — Finisher review fixes (2026-09-26)

- [x] T30 — One copy absorbs at most one posting of each source: within-run marks count jobs per
  source (`seen` / `kept`); across runs a stored row absorbs at most one new job per source per
  run, and none when the job's source already has a row with the key; a batch's marks are committed
  after its writes, without the new rows that were not written (FR-6, D23; review F1, F5).
- [x] T31 — `staleSources`: at the end of a full run, the sources unseen for 10 days, read from the
  database; the full task fails when there are any and the crawl was not complete or sources
  failed; `incompleteStreak` is information only (FR-9, FR-12, D27; review F2).
- [x] T32 — The read-ahead left-joins `jobs` (a vanished row is written again); the last-seen
  refresh locks its rows in byte order (D24; review F3, F4).
- [x] T33 — A failed stored-coordinate lookup sends nothing to Google (D26; review F6).
- [x] T34 — `errorText` cuts Drizzle's parameter list without a driver cause; the sync route uses
  it (D25; review nits).

## Notes

- Write tests alongside each implementation task.
- Verify zero competitor references before every commit.
