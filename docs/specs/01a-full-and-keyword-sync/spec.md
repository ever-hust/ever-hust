# Spec: 01a — Full + keyword job sync (Ever Jobs contract v1 consumer)

| Field          | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Spec ID        | 01a                                                            |
| Slug           | full-and-keyword-sync                                          |
| Status         | in-progress                                                    |
| Owner          | Hust (consumer) ← Ever Jobs (producer)                         |
| Created        | 2026-09-24                                                     |
| Last updated   | 2026-09-25                                                     |
| Supersedes     | the sync half of [01 — Harvest Ever Jobs](../01-harvest-ever-jobs/spec.md) |
| Related specs  | 01, 04 (liveness), 07 (legitimacy)                             |

## 1. Problem Statement

Hust ingests its job corpus from the Ever Jobs API, but only ever stores **page 1** of each
15-minute keyword search:

- `sync-jobs-schedule` (Trigger.dev, every 15 min) POSTs `/api/jobs/sync` with
  `{ resultsWanted: 80 }`; the route calls `searchJobs(...)` with `page=1&page_size=80`.
- Ever Jobs sorts the fan-out by site name **before** paginating (and caps `page_size` at 100),
  so every stored row comes from sources whose name starts with "a" — in production 100 % of the
  6,587 rows, 66 % of them one company.
- Each call nevertheless scrapes ~1,669 sources / ~20–30 k jobs in ~2.5 min: most ATS adapters
  ignore the keyword. Hust throws ~99.7 % of that work away.
- The route upserts one row at a time, geocodes aggressively (Google returns `OVER_QUERY_LIMIT`
  daily), and returns HTTP 200 even when the upstream call failed, so failed runs look green.
- The public search orders by `date_posted DESC`, which in Postgres puts `NULL` dates **first**.

## 2. Goals

- Store **all** jobs Ever Jobs can return, not page 1.
- Run **both** a keyword-less full sync (every source that can list without a keyword) **and**
  rotating keyword searches (some platforms only answer to a keyword), deduplicated.
- Bounded memory and bounded database write amplification (the Postgres instance is shared with
  other products, including a production one).
- A failed or truncated sync must show as a **failed** run, never a green one.
- Liveness / legitimacy probing stays **off by default** (it multiplies outbound requests).
- Intern / new-grad / quant coverage in the keyword rotation; carry the upstream career-level
  classification into `job_level`.

## 3. Non-Goals

- Deleting or expiring jobs (deletion cascades into users' applications/evaluations/favourites).
  `daily-cleanup` and `cleanup-expired-jobs` are untouched.
- Deploy-manifest or Trigger.dev environment changes (new env vars all have safe defaults).
- Schema changes to `jobs` (see Decision D1).
- Querying Ever Jobs live per user search.

## 4. Caller Stories

> As an **operator**, I want a sync run to fail loudly (FAILED run, non-2xx or `ok:false`) when
> the upstream failed or the stream was cut, so that silent data loss is impossible.

> As a **job seeker**, I want to see jobs from every source, including internships and new-grad
> roles, newest first, so that the canvas is not dominated by one alphabetically-early company.

> As a **fork operator**, I want the full sync to work against an older Ever Jobs server too
> (plain JSON response), so that upgrading the two services is not lock-step.

## 5. Functional Requirements

| ID    | Requirement | Priority |
| ----- | ----------- | -------- |
| FR-1  | `EverJobsClient` gains an NDJSON streaming search (`?format=ndjson`, contract v1 C3): an async generator that parses line by line with correct chunk-boundary and CRLF handling, validates each job with a zod schema (invalid → skipped + counted), ignores unknown line types, and throws `TruncatedStreamError` on a missing `end` line or an `error` line. | must |
| FR-2  | Graceful fallback: when the server answers `application/json` (pre-contract server), the client parses the array / `{ jobs }` body and yields the same events, ending with a synthetic `end` (`legacy: true`, `total` = the server's full `count`). The request carries `paginate=true&page=1&page_size=100`, which a contract-v1 server ignores in NDJSON mode, so a pre-contract server answers one bounded page instead of the whole fan-out as a single document. | must |
| FR-3  | Streaming requests use a separate long timeout `EVER_JOBS_STREAM_TIMEOUT_MS` (default 30 min) and an undici dispatcher with raised headers/body timeouts. | must |
| FR-4  | List mode: `searchTerm` omitted when blank (contract C1). `siteCategories` passed through (C2). | must |
| FR-5  | Liveness/legitimacy flags are sent **only** when `EVER_JOBS_REQUEST_SIGNALS=true` (default off; per-call `signals` still wins). | must |
| FR-6  | A shared ingest core consumes the stream in batches of 250 with bounded memory; maps with `mapJobToDb`; skips invalid rows; asks Ever Jobs for every observation (`dedup=false`, D22) and dedupes within the run itself by `external_id` and by `dedupKey` (C9), or for a job without a key by company + title + location; prevents a second row when a `dedupKey` already exists under a different `external_id` (cross-run merge, D2). | must |
| FR-7  | One bulk upsert statement per batch: `INSERT … ON CONFLICT (external_id) DO UPDATE … WHERE (content columns) IS DISTINCT FROM (excluded content columns)`, so unchanged rows are not rewritten; falls back to row-by-row only when the batch statement fails. Every statement (the batch's, and each fallback row's) follows the jobs-writer rule (D20): it runs alone in `withBoundedJobsInsert`, every row ends with `createdAt: JOBS_CREATED_AT`, the conflict `SET` never touches `created_at`, and a statement holds at most 250 rows. | must |
| FR-8  | Geocode only rows that lack coordinates, memoised per normalised `(city,state,country)` within the run **and across runs of the process** (coordinates and ZERO_RESULTS 24 h, failed calls 1 h, "no stored coordinates" 6 h; bounded to 20 k entries), reusing coordinates already stored for the same location key (one batched query per batch, only for locations the process memo does not know) before calling Google; stop calling Google for the rest of the run after the first `OVER_QUERY_LIMIT` (also `REQUEST_DENIED`) and keep it off for the process for 1 h; cap Google calls per run (`JOBS_SYNC_GEOCODE_MAX_CALLS`, default 500, for full runs; `JOBS_SYNC_KEYWORD_GEOCODE_MAX_CALLS`, default 100 and never above the former, for keyword runs). | must |
| FR-9  | Counters per run: `received, inserted, updated, unchanged, invalid, duplicatesMerged, mergedWrites, geocodeCalls, geocodeReused, errors, durationMs` (`mergedWrites` = merges that rewrote the owning row, a subset of `duplicatesMerged`), plus the upstream crawl completeness `complete, stopReason, sourcesSkipped, sourcesFailed` (D21); one summary log line per run, and one warning line when an ok run is not complete. | must |
| FR-10 | Two modes. `full`: no `searchTerm`, no `siteCategories`, `resultsWanted = JOBS_SYNC_FULL_RESULTS_PER_SOURCE` (default 1000), `country: "USA"` kept only as the Indeed-style hint; runs only once the process has seen Ever Jobs answer in NDJSON (D18, `JOBS_SYNC_FULL_ENABLED`). `keywords`: rotating term(s), `siteCategories = JOBS_SYNC_KEYWORD_SITE_CATEGORIES` (default `job-board,niche,regional,remote,government,freelance`), `resultsWanted = JOBS_SYNC_KEYWORD_RESULTS_PER_SOURCE` (default 100; 80 until contract v1 is seen, D18). Any per-source count is capped at 1000. | must |
| FR-11 | `POST /api/jobs/sync` is guarded by the shared cron guard `verifyCronRequest` (`apps/web/lib/cron-auth.ts`: `CRON_SECRET`, constant-time, fail closed in production), accepts `{ mode?, searchTerms?, resultsWanted?, siteCategories?, deadlineMs? }`, returns non-2xx if it fails **before** streaming (auth 401, no `CRON_SECRET` in production 503, bad body 400, same mode already running in this process 409, upstream refused 502), otherwise streams NDJSON progress lines (≤ every 10 s) and ends with exactly one `{"type":"summary","ok":…,…counters}` line. `ok` is never `true` when the upstream failed or a stream was truncated. | must |
| FR-12 | Trigger.dev: `sync-jobs-schedule` (`*/15`) runs `mode=keywords`; new `sync-jobs-full-schedule` (`20 */6 * * *`) runs `mode=full` with `maxDuration` 3600 s and a `concurrencyLimit: 1` queue. Both read the route's progress stream, parse the summary, return the counters and **throw** when `ok` is false or the summary is missing. A run that is `ok` on a partial crawl (`complete: false`, D21) does **not** throw: the task logs a warning with the `stopReason` and returns the summary. | must |
| FR-13 | `SEARCH_TERMS` gains intern / new-grad / entry-level / quant terms. | must |
| FR-14 | `mapJobToDb`: `job_level ← careerLevel.level` (C7) when present and not `unknown`, else the source `jobLevel`; `careerLevel` and `dedupKey` stay in `raw_data`. | must |
| FR-15 | `/api/jobs/search` orders by `date_posted DESC NULLS LAST`. | must |

## 6. Non-Functional Requirements

| ID    | Requirement | Target |
| ----- | ----------- | ------ |
| NFR-1 | Memory while ingesting a full run | O(batch) rows + O(run) id/key sets (no whole-response buffering on the NDJSON path) |
| NFR-2 | DB writes for an unchanged corpus | ≤ 1 rewrite per row per week (skip-unchanged `WHERE` + weekly last-seen refresh, D14) |
| NFR-3 | DB round trips per batch | ≤ 6 plus the row-by-row fallback, most batches ≤ 3 (existence; dedup candidates + candidate keys, only for new ids with a `dedupKey`; merge-owner existence, only when merging; location reuse, only for locations the process memo does not know; upsert; row-by-row fallback only when the upsert fails) |
| NFR-4 | Caller header/body timeouts | headers within ~15 s, a line at least every 10 s |

## 7. Contracts

### 7.1 Upstream (Ever Jobs contract v1, consumed)

- C1 list mode, C2 `siteCategories`, C3 NDJSON (`progress` / `job` / `end` / `error`; unknown
  types ignored), C5 liveness opt-in, C7 `careerLevel`, C9 `dedupKey`.
- End-line crawl completeness (additive fields of the C3 `end` line):
  `{"type":"end","total":N,"deduped":bool,"durationMs":ms,"complete":bool,"stopReason":"deadline"|"job_ceiling"|null,"sourcesSkipped":n,"sourcesFailed":n}`.
  `complete: false` means the producer's fan-out deadline or job ceiling left sources unscraped;
  a missing or non-true `complete` (an older producer, the legacy JSON fallback) is read as "not
  known complete" (D21).
- `?dedup=false` opts out of the producer's cross-source dedup (its default is on); every job still
  carries its `dedupKey`. The sync always sends it (D22).

### 7.2 Route stream (produced by Hust, consumed by the Trigger tasks)

```ts
// POST /api/jobs/sync   (Authorization: Bearer $CRON_SECRET)
type SyncRequest = {
  mode?: "keywords" | "full";          // default "keywords"
  searchTerms?: string[];              // keywords mode only (400 with mode "full"); ≤ 5 used
  resultsWanted?: number;              // per source, 1..1000 (400 above)
  siteCategories?: string[];           // keywords mode only (400 with mode "full")
  deadlineMs?: number;                 // caller's budget, 1 000..7 200 000 ms (default 7 200 000):
                                       // no Ever Jobs stream is read past it (the run reports ok:false)
};
// 200 application/x-ndjson; one JSON object per line:
type SyncLine =
  | { type: "start"; mode: "keywords" | "full"; terms: string[] }
  | { type: "progress"; received: number; inserted: number; updated: number;
      unchanged: number; upstream?: { sourcesDone?: number; sourcesTotal?: number; jobs?: number } }
  | ({ type: "summary"; ok: boolean; mode: string; terms: string[]; truncated: boolean;
       complete: boolean; stopReason: string | null; sourcesSkipped: number; sourcesFailed: number;
       errorMessages: string[]; skipped?: string } & SyncCounters);
// skipped: the run did nothing on purpose (full mode gated off, D18) — ok is true.
// complete: every upstream stream's end line said complete:true (D21). ok:true + complete:false is a
//   partial crawl that was stored (stopReason: the producer's, e.g. "deadline", or Hust's own:
//   "not_reported" | "truncated" | "upstream_failed" | "aborted" | "crashed" | "skipped").
// 4xx/5xx application/json when the run fails before streaming:
//   { type: "summary", ok: false, error: string, ... }
```

### 7.3 Errors

| Code / class          | Meaning |
| --------------------- | ------- |
| `TruncatedStreamError` | Upstream stream ended without an `end` line, sent an `error` line, or was aborted. Jobs received before it are kept; the run is `ok:false`. |
| HTTP 401              | Missing / wrong `CRON_SECRET`. |
| HTTP 503              | `CRON_SECRET` is unset and `NODE_ENV=production`: the route fails closed (outside production it stays open for local development). |
| HTTP 400              | Invalid body (unknown mode, bad types, `resultsWanted` > 1000, `searchTerms` / `siteCategories` with mode `full`). |
| HTTP 409              | A run of the same mode is still in flight in this process (single flight, D11). |
| HTTP 502              | Upstream could not be opened (connection refused, non-2xx, circuit open). |

## 8. Test Plan

- Unit (jest, `jobs-api`): NDJSON parser — split chunks, multi-byte UTF-8 split across chunks,
  CRLF, blank lines, missing `end`, `error` line, invalid job line, malformed JSON line, unknown
  type; JSON fallback (array and `{jobs}`); list-mode body (no `searchTerm`); signals default off.
- Unit (jest, `triggers`): ingest batching + bulk upsert SQL (assert the `IS DISTINCT FROM`
  `WHERE` clause), within-run and cross-run dedupe, geocode memo / DB reuse / quota stop / cap,
  mode selection + env parsing, rotation incl. new terms, Trigger task throws on `ok:false` and
  on a missing summary, `mapJobToDb` career level.
- Unit (jest, `web-lib`): route handler — 401/400/502 before streaming, `ok:false` on a truncated
  stream, summary line always last.
- Integration (jest, `triggers`, opt-in): `job-store.integration.test.ts` runs the Drizzle store
  and the ingest core against a real, throwaway Postgres (`JOBS_SYNC_IT_DATABASE_URL`, database
  name must end in `_it`/`_test`, schema pushed first) and proves no tuple is rewritten for an
  unchanged corpus (`xmin` stable), the weekly refresh, the merge (no flip between two sources of one posting, stale-owner takeover) and the coordinate reuse.
- No live calls: all upstream access is faked; no shared database is touched.

## 9. Open Questions

None blocking; see Decisions.

## 10. Decisions

- **D1 — `dedupKey` / `careerLevel` live in `raw_data`, no schema change.** The deployed databases
  are `drizzle-kit push`-managed: the `__drizzle_migrations` journal is empty, so
  `drizzle-kit migrate` would replay `0000_*` and fail (see `.github/workflows/deploy-do-prod.yml`
  and `packages/db/scripts/ensure-*.cjs`); the homelab deployment runs no migration step at all.
  There is no automatic migration-file path, and the database is shared with a production
  product, so this epic does not alter `jobs`. The DTO (including `dedupKey` and `careerLevel`) is
  already persisted verbatim in `raw_data`. The cross-run lookup is two steps, because reading
  `raw_data` (the whole DTO, description included, usually TOASTed) for every row that shares a
  company detoasted thousands of rows per run for one new posting of a large employer (review of
  2026-09-25): (1) narrow columns only (`id, external_id, title, company_name`) for rows sharing an
  exact title **or** company, through the existing btree indexes, once per title/company per run;
  (2) `raw_data->>'dedupKey'` by primary key only for the candidates whose title **and** company
  match an incoming job loosely (case, accents, punctuation, trailing corporate suffix such as
  "Inc." / "S.A."). The stored key must still match exactly, so the loose step can only miss a
  duplicate, never cause a wrong merge. Trade-off: a duplicate whose title or company differs
  between sources beyond that loose normalisation (e.g. "Sr." vs "Senior"), or whose title and
  company both differ verbatim, is not detected and gets its own row (it is still collapsed
  upstream within a single response). A future `dedup_key` column + index is the upgrade path once
  the deployment has a migration step.
- **D2 — cross-run duplicates merge onto the existing row, keeping its content.** When a job's
  `dedupKey` already exists under a different `external_id` (and its own `external_id` is not in
  the table), no second row is created and the owning row keeps its `id`, `external_id`,
  `created_at` **and content**: when the same posting reaches Hust through two sources (e.g. the
  ATS copy in full runs and a board copy in keyword runs), the row must not flip between them on
  every run (that rewrote the whole row, TOASTed description included, each time — review of
  2026-09-25). The one exception is a **takeover**: when the owning row has not been refreshed
  for `MERGE_TAKEOVER_DAYS` (14 = twice the D14 refresh window) its own source has stopped listing
  it, so the merging source rewrites it (content, URLs, `raw_data` with that source's id,
  `updated_at`). A row whose own source is still seen is refreshed at least weekly and is never
  taken over; a row kept alive only by the other source is rewritten at most once per 14 days, so
  it never ages into the 90-day cleanup. The rule is decided by the ingestor (the owner's
  `updated_at` is read with the existence lookup) and enforced again in the upsert `WHERE` (a
  merge row is recognised by `raw_data.id <> external_id`), so it also holds under concurrent
  runs. Counted in `duplicatesMerged`; merges that actually wrote are also counted in
  `mergedWrites`. Not done: a source-preference rule (e.g. ATS over board) — Hust has no category
  metadata per site; the first source seen keeps the row.
- **D3 — partial results are kept.** Jobs received before a truncation are upserted (upserts are
  idempotent and nothing is deleted based on completeness); the run still reports `ok:false`.
- **D4 — `ok` semantics.** `ok = every upstream stream ended with an end line ∧ no fatal error ∧
  ¬(errors > 0 ∧ nothing persisted)`. A handful of rows Postgres rejects do not fail the run (they
  are counted in `errors` and logged); a run that persisted nothing because every write failed does.
- **D5 — career level `unknown` defers to the source.** `job_level` takes `careerLevel.level`
  unless it is `unknown`, in which case the source's own `jobLevel` (e.g. "Mid-Senior level") is
  kept.
- **D17 — a process-level geocoding memo.** A run-scoped memo alone sent every unresolvable
  address to the stored-coordinate query (a sequential scan: no index covers the computed location
  key, and D1 rules out a migration) and to Google again on every 15-minute run — up to
  ~96 × 500 + 4 × 500 ≈ 50 k Google calls a day, mostly on the same bad addresses (review of
  2026-09-25). The web pod now keeps a bounded TTL memo shared by its runs (FR-8), keyword runs get
  a lower cap (100), and quota / denied answers pause Google for the process for an hour. The
  memo is per process (each pod learns on its own); an expression index on the location key is the
  upgrade path once the deployment has a migration step.
- **D6 — Google geocoding is capped per run** (`JOBS_SYNC_GEOCODE_MAX_CALLS`, default 500) and
  also stops after `REQUEST_DENIED` (the key is unusable for the rest of the run), in addition to
  `OVER_QUERY_LIMIT`.
- **D7 — Trigger retries off for the sync schedules** (`maxAttempts: 1`). A failed keyword run is
  retried by the next 15-min tick; retrying a failed full run would re-scrape every source.
- **D8 — the route opens the first upstream stream before committing to HTTP 200**, but waits at
  most `JOBS_SYNC_OPEN_GRACE_MS` (default 15 s). A pre-contract server only sends headers after
  its whole scrape, so after the grace period the route starts streaming heartbeats anyway and a
  later failure is reported as `ok:false` in the summary.
- **D9 — the undici dispatcher reuses Node's bundled undici** (the `Agent` class behind the
  shared `Symbol.for("undici.globalDispatcher.1")` global dispatcher), so the dispatcher is always
  version-compatible with the global `fetch` and no new dependency enters the lockfile or the
  Next.js / Trigger bundles. If it cannot be resolved, the request runs with default timeouts.
- **D10 — the sync route answers with its own `{"type":"summary","ok":false,…}` bodies** (plain
  `Response`, plus `X-Request-Id`) instead of the `apiError()` helper shape, so the scheduler reads
  one contract for early failures and for the streamed summary.
- **D11 — the run continues if the caller disconnects, but only within the caller's budget and
  never twice at once.** The scheduled callers send `deadlineMs` (their own timeout minus 20 s);
  each Ever Jobs stream is opened with at most the time left (`EVER_JOBS_STREAM_TIMEOUT_MS` caps
  it otherwise) and no stream is opened past it, so a run cannot outlive its caller by more than
  the final flush. A request without `deadlineMs` gets the 2 h ceiling as its budget, so every
  run is bounded. The route also keeps one run per mode in flight per process: while one runs, a
  second request for the same mode gets HTTP 409 (the Trigger run fails loudly, which is the
  signal that Ever Jobs is slow) instead of piling a second fan-out on top (review of
  2026-09-25). A run that still holds its slot 10 min (`STALE_RUN_GRACE_MS`) after its deadline
  is treated as hung: the next request logs an error and starts a new run, so one stuck run
  cannot block its mode until the pod restarts (the hung run's late release leaves the new
  run's slot alone). The guard is per process; with several web pods the deadline is what bounds
  the overlap. Within those bounds: upserts are idempotent, nothing is
  deleted, and the summary is still logged; aborting would only throw finished work away.
- **D12 — `NULLS LAST` also on `/api/jobs/map`**, which shares the filter builder with
  `/api/jobs/search` and caps its result set, so undated jobs were filling the map cap too. The
  existing `jobs_date_posted_idx (date_posted DESC)` is `NULLS FIRST`, so these queries now sort
  instead of walking that index; at the current corpus size this is a bounded top-N sort. Other
  `desc(date_posted)` call sites (companies page, `/api/v1/jobs`, the AI `searchJobs` tool) are
  left for a follow-up.
- **D15 — the legacy fallback is one bounded page.** Without pagination a pre-contract server
  answers the whole fan-out (20–30 k jobs, hundreds of MB) as one JSON document, which the web pod
  would have to hold in memory every 15 minutes. Pagination params are ignored in NDJSON mode
  (contract v1 C3), so sending them only bounds a pre-contract server to its first 100 jobs; the
  run logs a warning with the server's full `count` until Ever Jobs is upgraded.
- **D14 — weekly last-seen refresh.** The daily cleanup deletes jobs whose `updated_at` is older
  than 90 days (when `date_posted` is old or missing), and the old sync touched `updated_at` on
  every run. A pure skip-unchanged upsert would let live-but-unchanged postings age into that
  delete (which cascades into users' applications). The upsert therefore also rewrites an
  unchanged row when its `updated_at` is older than 7 days (`LAST_SEEN_REFRESH_DAYS`): at most one
  rewrite per row per week instead of one per run. Such refreshes count as `updated`.
- **D16 — stored liveness / legitimacy verdicts are sticky.** Signals are opt-in per request and
  now off by default (FR-5), so a DTO without them means "not asked", not "no verdict". The
  `liveness` / `legitimacy` / `legitimacy_reasons` columns are therefore neither compared nor
  overwritten with a missing value: the upsert uses `coalesce(excluded.x, jobs.x)` for both the
  change test and the `SET` (reasons follow their verdict: a new verdict without reasons clears
  the old reasons). Without this, the first sync after the default flipped would have rewritten
  every row that had a stored verdict and erased verdicts the UI shows. A stored verdict is
  replaced only when a new one arrives.
- **D13 — the scheduled tasks accept an app that predates the streaming route** (a JSON
  `{searchTerms,totalUpserted,errors}` body) so Hust's own two deployables — the Trigger.dev tasks
  and the web app — can deploy in either order; that legacy answer fails the run when it reports
  errors. This is about Hust's two parts only. Against **Ever Jobs**, order matters without D18
  (correction after the 2026-09-25 review): an earlier draft claimed the consumer and producer
  could ship in either order, but a full run against a pre-contract Ever Jobs would re-scrape the
  whole catalogue at 1000 per source for one stored page.
- **D18 — full mode waits for Ever Jobs contract v1.** A pre-contract Ever Jobs has no list mode
  and no NDJSON: it drops `siteCategories` (its validation pipe whitelists fields without
  rejecting unknown ones), fans out to every source, holds the whole result in memory, applies
  its hard 120 s deadline, and only then serves page 1 sorted by site name. A full run against it
  would ask every source for 1000 jobs (12.5× the old 80) and store the same 100 jobs from
  sources starting with "a"; keyword runs would ask for 100 instead of 80. So every run records
  what the server answered (NDJSON = v1, plain JSON = legacy) in a process-level tracker — the
  15-minute keyword runs keep it current at no extra cost — and `JOBS_SYNC_FULL_ENABLED`
  decides: `auto` (default) runs full mode only when the last observation in this process was
  v1, otherwise the run ends at once with `ok: true, skipped: "<reason>"` (a normal NDJSON
  stream; the Trigger task logs it and does not fail); `true` forces full mode (the operator
  knows the producer is upgraded); `false` disables it. Until v1 is seen, keyword runs use the
  old per-source count (80, `LEGACY_RESULTS_PER_SOURCE`); an explicit `resultsWanted` in the
  request body still wins. Consequences: Hust can now deploy before Ever Jobs; a freshly started
  pod skips full runs until it has served one keyword run (≤ 15 min), so right after a restart
  one 6-hourly full run may be skipped; the in-process `sync-jobs` task starts every run with an
  unknown contract, so it needs `JOBS_SYNC_FULL_ENABLED=true` for full mode. The tracker is per
  process (each pod learns on its own).

- **D19 — deployment requirements for a complete full sync (review of 2026-09-25).**
  1. **Ever Jobs must raise its fan-out deadline.** Contract v1 C4 keeps the producer's default at
     120 s (`EVER_JOBS_FANOUT_DEADLINE_MS`). With the default, every source that has not finished
     within 120 s contributes nothing to a full run, however long Hust is willing to wait, so
     "all jobs" is only reached when the Ever Jobs deployment sets `EVER_JOBS_FANOUT_DEADLINE_MS`
     above 120 s. The setting is **global** on the producer: it also bounds every keyword search.
     And job lines only arrive **after** the fan-out ends (contract C3: progress lines while
     scraping, then the jobs, then `end`), so a stream Hust stops before the producer's deadline
     yields no jobs at all and a truncated, `ok:false` run. The producer's deadline must therefore
     sit below Hust's **shortest** budget with room left to stream and store the results — today
     the 15-minute keyword run: `maxDuration` 600 s → the route is told `deadlineMs` ≈ 550 s. So
     keep `EVER_JOBS_FANOUT_DEADLINE_MS` at about 6–7 min (e.g. `420000`), not above ~8 min; a
     larger value turns every keyword run whose slowest source hits it into a failed run that
     stores nothing. (The full run's budget, ≈ 59 min with `EVER_JOBS_STREAM_TIMEOUT_MS` capping
     each stream at 30 min, is never the binding limit.) If the full catalogue needs longer, raise
     `KEYWORD_SYNC_MAX_DURATION_S` (`packages/triggers/src/sync-runner.ts`; it sets both the
     task's `maxDuration` and the route budget) together with the producer's deadline, staying
     under the 15-minute schedule interval (a longer run makes the next tick answer 409). Hust
     never changes producer settings.
  2. **Serverless hosts bound the route.** `/api/jobs/sync` sets no `maxDuration`: on a
     serverless platform (e.g. Vercel) the function is killed at the plan's limit, so a full run
     ends early and D11 (keep running after the caller disconnects) does not hold there. Run the
     sync route on a long-lived Node host (the k8s deployment), or add `export const maxDuration`
     to `apps/web/app/api/jobs/sync/route.ts` within the plan's limit and lower
     `JOBS_SYNC_FULL_RESULTS_PER_SOURCE` accordingly.
  3. **Order:** Hust may deploy before Ever Jobs contract v1 (D18 gates full runs); the full sync
     starts producing complete results once Ever Jobs v1 is live **and** step 1 is done.

- **D20 — the sync's upsert follows the jobs-writer rule (rebase onto develop `e551cef`).** Job
  alerts read each period's jobs once, which is only safe when every `jobs` row commits within a
  known time of its `created_at` (`docs/internal/CRON_ENDPOINTS.md`, "The jobs-writer rule";
  `packages/db/src/jobs-insert.ts`). The batch upsert used to stamp `created_at` with a JavaScript
  `new Date()` taken before the statement and ran outside any bounded transaction. Now
  `buildUpsertQuery(tx: JobsInsertTx, rows)` is called only as
  `withBoundedJobsInsert(db, (tx) => buildUpsertQuery(tx, rows))`: one multi-row
  `INSERT … ON CONFLICT … DO UPDATE … WHERE <changed>` per transaction (a multi-row VALUES list is
  one statement), `createdAt: JOBS_CREATED_AT` as the last key of every row, `created_at` never in
  the conflict `SET`. The skip-unchanged `WHERE` (FR-7, D14, D2) is unchanged. A statement holds at
  most `MAX_UPSERT_ROWS_PER_STATEMENT` = 250 rows (the ingest batch; the ingestor clamps a larger
  `batchSize` and the store refuses a larger batch), far inside the rule's 60 s statement timeout.
  The row-by-row fallback is one bounded transaction per row. The source guard
  (`packages/db/src/jobs-insert-guard.test.ts`) passes with no exception for this writer.

- **D21 — a run records whether the upstream crawl was complete (review of 2026-09-25).** The
  producer's NDJSON `end` line now says whether its fan-out covered every selected source
  (`complete`, `stopReason`, `sourcesSkipped`, `sourcesFailed`; additive fields). Before, an end
  line looked the same for a crawl that covered every source and for one its deadline cut in half,
  and Hust reported both as a plain `ok: true`. The client parses the four fields (ill-typed
  values are dropped, never coerced); the run is `complete` only when **every** upstream stream
  ended with `complete === true`. A missing or non-true `complete` (an older producer, the legacy
  JSON fallback, an older app's summary read by a newer task) means "not known complete"
  (`stopReason: "not_reported"`), never "complete". A partial crawl is **not** a failure: D3 still
  keeps what arrived and D4's `ok` is unchanged, so the summary says `ok: true, complete: false`
  with the producer's `stopReason` (`deadline`, `job_ceiling`) and the summed source counts; the
  run logs one warning line, and the Trigger task logs a warning and returns the summary instead
  of throwing (a full run cut by the producer's deadline would otherwise fail every 6 hours
  although it stored everything it received). Failed, truncated and skipped runs are never
  complete and name their reason (`upstream_failed`, `truncated`, `aborted`, `crashed`,
  `skipped`). Nothing is deleted or expired on the basis of completeness (non-goal); the fields
  are what a future "absent from a complete crawl" rule would need.
- **D22 — the sync asks Ever Jobs NOT to dedup (`dedup=false`) and dedupes by `dedupKey` itself
  (review of 2026-09-25).** The producer's default hybrid dedup merges postings that share a title
  across DIFFERENT cities or employment types and drops all but one: one employer's 30 postings
  came back as 20, and a New York new-grad role was merged into a Hong Kong internship. With
  `dedup=false` the producer streams every observation, and every job still carries the producer's
  `dedupKey` (company | title | location, the same key with or without its dedup), so Hust's own
  dedupe keeps postings in different places apart and still collapses one posting seen through
  two sources: within the run by `external_id` and `dedupKey` (first seen wins), across runs by the
  stored key (D1/D2). The client sends `dedup` explicitly on every streaming request
  (`SearchStreamOptions.dedup`, default `false`). A pre-contract server honours `dedup=false` but
  stamps no `dedupKey`; for a job without a key the within-run dedupe falls back to company + title
  + location compared loosely (`fallbackDedupIdentity`), so its cross-source copies within one run
  are still collapsed (such jobs have no stored key, so they are not merged across runs). Cost: the
  producer streams more lines (duplicates it used to drop); they are counted in
  `duplicatesMerged` and never written.

**Implementation status (2026-09-24):** all tasks in [`tasks.md`](tasks.md) implemented on branch
`feat/full-and-keyword-sync`; not yet deployed. Review fixes of 2026-09-25 (D2 revised, D1
two-step probe, D11 bounds, D16–D19) implemented on the same branch. Rebased onto develop
`e551cef` on 2026-09-25 with the follow-ups D20 (jobs-writer rule), the shared cron guard
(FR-11), D21 (crawl completeness) and D22 (`dedup=false`). Verify after deploy: while
Ever Jobs predates v1, `sync-jobs-full-schedule` runs end `ok:true` with `skipped` and keyword
runs request 80 per source; once v1 is live (and D19 step 1 done), a full run ends `ok:true` with
`received` close to the upstream `end.total` and `complete: true` (or a `stopReason` saying which
producer bound cut it), a second full run is mostly `unchanged` with `mergedWrites` near 0, and
the corpus is no longer dominated by sources starting with "a".

## 11. References

- `packages/jobs-api/src/index.ts`, `packages/jobs-api/src/ndjson.ts`
- `packages/triggers/src/ingest/*`, `packages/triggers/src/sync-jobs.ts`
- `apps/web/app/api/jobs/sync/route.ts`, `apps/web/lib/jobs-sync-route.ts`
- `apps/web/app/api/jobs/search/route.ts`
