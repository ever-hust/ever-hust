# Plan: 01a — Full + keyword job sync

| Field        | Value      |
| ------------ | ---------- |
| Spec         | spec.md    |
| Created      | 2026-09-24 |
| Last updated | 2026-09-24 |

## 1. Approach

The sync becomes a **stream consumer**. The Ever Jobs client opens `POST /api/jobs/search?format=ndjson`
and yields typed events (`progress`, `job`, `invalid`, `end`) from an async generator; a pre-contract
server that answers plain JSON is adapted into the same event sequence. Nothing buffers the whole
response on the NDJSON path.

A shared **ingest core** (`packages/triggers/src/ingest/`) turns events into database writes in
batches of 250: validate → dedupe (within run by `external_id` and `dedupKey`; across runs by
`dedupKey` via an index-narrowed probe of `raw_data`) → geocode only what lacks coordinates
(memo → stored coordinates for the same location → Google, with a quota stop and a per-run cap) →
one bulk `INSERT … ON CONFLICT (external_id) DO UPDATE … WHERE … IS DISTINCT FROM …` statement.
The database access sits behind a small `JobStore` interface so the core is unit-testable with a
fake; the Drizzle implementation's SQL is asserted with `toSQL()` on a mock driver.

`runJobsSync()` plans the upstream requests for a mode (`full` or `keywords`), opens each stream,
feeds the ingestor, turns `TruncatedStreamError`/open failures into `ok:false`, and reports
progress through a callback. Both the HTTP route and the in-process Trigger task call it.

The route (`POST /api/jobs/sync`) authenticates, validates the body, opens the first upstream
stream (bounded by a short grace period) so a refused upstream still yields a non-2xx, then streams
its own NDJSON: a `start` line, heartbeat/progress lines at most every 10 s, and a final `summary`
line. `Cache-Control: no-store, no-transform` keeps Next's gzip middleware from buffering the stream.

The Trigger schedules call the route (so the sync runs in the app's runtime, which can reach an
internal Ever Jobs service), read the NDJSON lines with the shared line reader, and throw when the
summary is `ok:false` or missing.

## 2. Phases

### Phase 1 — Client (packages/jobs-api)

- Deliverables: `ndjson.ts` line reader, `JobPostSchema`, `openSearchStream()` / `streamSearchJobs()`,
  `TruncatedStreamError`, long-timeout dispatcher, signals default off, `siteCategories` /
  `careerLevels` on `ScraperInput`, `dedupKey` / `careerLevel` on `JobPostDto`.
- Exit: parser + fallback + request-shaping tests green.

### Phase 2 — Ingest core (packages/triggers)

- Deliverables: `ingest/config.ts` (modes, env parsing, rotation), `ingest/geocoder.ts`,
  `ingest/job-store.ts` (Drizzle store + SQL builders), `ingest/ingestor.ts`, `ingest/run-sync.ts`,
  `map-job.ts` career-level mapping + new `SEARCH_TERMS`.
- Exit: ingest, dedupe, geocode, SQL and mode tests green.

### Phase 3 — Route + schedules

- Deliverables: `apps/web/lib/jobs-sync-route.ts` handler + thin `route.ts`; keyword + full
  schedules and the in-process task in `sync-jobs.ts`; `NULLS LAST` on `/api/jobs/search`.
- Exit: route semantics and Trigger task tests green; `pnpm lint` and `pnpm check-types` green.

### Phase 4 — Docs

- `apps/web/.env.example`, `turbo.json` `globalEnv`, this spec's status, spec 01 / 04 / 07 notes
  on the signals default.

## 3. Packages Touched

| Package              | Change |
| -------------------- | ------ |
| `packages/jobs-api`  | streaming search, zod job schema, signals default off, new input/DTO fields |
| `packages/triggers`  | ingest core, modes, geocoder, new search terms, career-level mapping, schedules |
| `apps/web`           | streaming sync route, `NULLS LAST` ordering, `.env.example` |
| `packages/db`        | none (no schema change — spec D1) |
| root                 | `turbo.json` `globalEnv` |

## 4. Dependencies

No new packages. The long-timeout dispatcher reuses Node's bundled undici (spec D9).

## 5. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Full run write amplification on the shared DB | M | H | skip-unchanged `WHERE`; one statement per batch; rows sorted by `external_id` (stable lock order) |
| `raw_data->>'dedupKey'` probe detoasts large rows | M | M | only for rows whose `external_id` is new; narrowed by indexed `title`/`company_name`; each value probed once per run |
| Google quota / billing | H | M | memo + stored-coordinate reuse + quota stop + per-run cap |
| Pre-contract Ever Jobs server | M | M | JSON fallback; open grace period so headers never wait for the whole scrape |
| gzip buffering of the progress stream | M | M | `Cache-Control: no-transform`; the Trigger task also sends `Accept-Encoding: identity` |
| Overlapping runs | L | M | one queue per schedule with `concurrencyLimit: 1`; bulk upserts sorted by key |

## 6. Rollback Plan

Revert the branch. Nothing is deleted and the schema is unchanged, so rows written by the new sync
stay valid for the old code. To pause only the full sync without a deploy, set
`SCHEDULER=cron` (both Trigger schedules no-op) or disable the `sync-jobs-full-schedule` schedule in
the Trigger.dev dashboard.

## 7. Migration Plan

None required. Existing rows have no `dedupKey` in `raw_data`; the first time an existing
`external_id` is seen again, the skip-unchanged `WHERE` treats the newly present `dedupKey` as a
change and backfills it once.

## 8. Open Questions for Plan

None.
