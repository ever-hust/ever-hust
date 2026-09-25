# Cron endpoints & the cleanup mode

_Last updated: 2026-09-25_

Hust's scheduled and background tasks are defined in Trigger.dev (`packages/triggers/src`), but
**the work runs inside the web app**. The Trigger.dev environment carries only two variables,
`CRON_SECRET` and `NEXT_PUBLIC_APP_URL` (the in-cluster app URL,
`http://hust-web.hust-<env>.svc.cluster.local:3000`). A Trigger task therefore never touches the
database, Resend or an LLM itself. It POSTs to an app endpoint and the app does the work.
**Never add `DATABASE_URL` (or any other app secret) to a Trigger.dev environment.**

Until 2026-09 six schedules opened the database from the Trigger worker and failed every run with
`DATABASE_URL environment variable is required`. Those schedules were `daily-cleanup`,
`daily-job-alerts`, `evening-job-alerts`, `weekly-job-alerts`, `daily-follow-up-nudges` and
`daily-funnel-snapshots`.

## Endpoints

| Trigger task(s) | Endpoint | Work (app runtime) | Trigger timeout |
|---|---|---|---|
| `daily-cleanup` (03:00 UTC), `cleanup` | `POST /api/cron/cleanup` | `runCleanup` | 290 s |
| `cleanup-expired-jobs` (on demand) | `POST /api/cron/cleanup-expired-jobs` | `cleanupExpiredJobs` | 290 s |
| `daily-job-alerts` (08:00), `evening-job-alerts` (18:00), `weekly-job-alerts` (Mon 08:00), `send-job-alerts` | `POST /api/cron/job-alerts` `{ frequencies: [...], windowEnd? }` | `runJobAlerts` | 290 s |
| `daily-follow-up-nudges` (09:00), `follow-up-nudges` | `POST /api/cron/follow-up-nudges` | `runFollowUpNudges` (**off by default**) | 290 s |
| `daily-funnel-snapshots` (02:00), `funnel-snapshots` | `POST /api/cron/funnel-snapshots` | `processFunnelSnapshots` | 290 s |
| `batch-evaluate` (on demand) | `POST /api/cron/batch-evaluate` `{ userId, jobIds, scoreFloor?, max? }` | `runBatchEvaluate` | 290 s |
| `inbox-sync-hourly`, `inbox-sync` | `POST /api/inbox/cron-sync` | inbox IMAP sync | 290 s |
| `sync-jobs-schedule` (every 15 min, keywords), `sync-jobs-full-schedule` (every 6 h, full) | `POST /api/jobs/sync` `{ mode, deadlineMs, ... }` | `runJobsSync` (NDJSON progress stream; spec `docs/specs/01a-full-and-keyword-sync`) | 570 s / 3570 s |

- **Code layout.** The work functions live in `packages/triggers/src/work/*`, exported as
  `@ever-hust/triggers/work`. That entry point never imports `@trigger.dev/sdk`, and a test checks
  this. The task files only call `callAppEndpoint()` (`packages/triggers/src/app-endpoint.ts`). The
  paths are listed in `packages/triggers/src/cron-endpoints.ts`, and a test checks that each one has
  a route file.
- **One route per task.** Each route has its own `maxDuration`, which Next.js only accepts as a
  static per-route export. Each route also gets its own logs, and a problem in one route cannot
  affect the others. The routes share `createCronHandler()` (`apps/web/lib/cron-route.ts`).
  `maxDuration` is advisory on the self-hosted pods: `next start` does not enforce it, so every
  run bounds itself (below).
- **Auth.** Every endpoint uses `verifyCronRequest()` (`apps/web/lib/cron-auth.ts`):
  - The secret is read from `Authorization: Bearer <CRON_SECRET>`, or from the legacy
    `x-cron-secret` header.
  - The secret is compared in constant time: both sides are SHA-256 hashed, then compared with
    `timingSafeEqual`.
  - If `CRON_SECRET` is unset and `NODE_ENV=production`, the endpoint **fails closed** with a 503.
  - If `CRON_SECRET` is unset outside production, the endpoint stays open for local development.
  - `/api/jobs/sync` uses the same guard (`apps/web/lib/jobs-sync-route.ts`). Its refusals keep
    the sync route's own body shape (`{"type":"summary","ok":false,"error":…}`, spec 01a D10)
    with the guard's status (401, or 503 when `CRON_SECRET` is unset in production).
  - Trigger.dev reaches the app through the in-cluster Service. These endpoints never need to be
    reachable from outside the cluster, and each environment should have its own `CRON_SECRET`.
- **Failures are never reported as a 2xx.** The task's `callAppEndpoint()` throws on any non-2xx
  response, network error or timeout, so the Trigger run shows **FAILED**. A partial failure
  returns a 500 with the counters in `details`. Partial failures include: some emails failed, an
  email was left to another run's in-flight send, a batch evaluation was interrupted, or the time
  budget ran out.
  A bad request body returns 400. An unknown user in `batch-evaluate` returns 404. An overlapping
  `funnel-snapshots` run returns 409.
- **Time limits.** Node's `fetch` (undici) drops a response whose headers take longer than 300 s,
  so trigger-side timeouts are capped at 290 s. A Trigger attempt that times out does **not** stop
  the app request it started, so each run bounds itself:
  - Cleanup, alerts and nudges stop after a 240 s budget. Cleanup reports `truncated: true` and
    the next day's run continues. Alerts and nudges report the remaining items as `deferred` and
    return a non-2xx, and the Trigger retry picks up where the run stopped.
  - `batch-evaluate` starts no new evaluation after 170 s (one LLM evaluation has no timeout of
    its own). At 270 s it **aborts** an evaluation that is still running: an `AbortSignal` cancels
    the in-flight AI SDK call, and no further validation attempt starts. It then waits up to 5 s
    and answers by 275 s. The evaluation goes in `interrupted`, the rest in `deferred`:
    - `aborted`: the call was cancelled and nothing was saved. The provider may still bill the
      tokens it had already produced.
    - `in_progress`: the evaluation did not stop within 5 s (for example, it was already saving),
      so it may still save its result.

    Interrupted jobs are **not** in `retryJobIds`. Before re-triggering one, check whether its
    evaluation exists. An evaluation that finishes during the 5 s counts as evaluated.
  - `funnel-snapshots` runs as one transaction under a Postgres advisory lock, so a retry that
    arrives while the first request is still writing gets a 409 instead of writing duplicates.
- **`maxDuration` of the tasks.** Trigger.dev defines `maxDuration` as the compute time a run may
  use, and waiting on `fetch` counts. The HTTP-delegating tasks set it to 1000 s
  (`APP_ENDPOINT_TASK_MAX_DURATION_S`), which covers 3 attempts x 290 s plus backoff even if
  Trigger sums the attempts. The project default (600 s) would not. Check `usageDurationMs` on a
  retried run to see which way this Trigger version counts.
- **The jobs sync is the exception to the 290 s cap** (spec `01a`). `/api/jobs/sync` sends its
  headers within `JOBS_SYNC_OPEN_GRACE_MS` (15 s) and then streams NDJSON progress lines at least
  every 10 s, so the header limit never applies; the tasks read that stream with their own client
  (`runSyncViaRoute`, `packages/triggers/src/ingest/route-client.ts`, not `callAppEndpoint()`)
  through a long-timeout dispatcher. `sync-jobs-schedule` (keywords) has `maxDuration` 600 s and waits 570 s,
  `sync-jobs-full-schedule` 3600 s and 3570 s; the route is told a budget 20 s shorter
  (`deadlineMs`) and bounds itself by it. Retries are off for both (the next tick is the retry).
  The run's summary line ends the stream: `ok: false` (or no summary) fails the run;
  `ok: true, complete: false` is a partial upstream crawl that was stored, logged as a warning.
  The on-demand `sync-jobs` task runs the sync in-process and needs `DATABASE_URL`, which the
  Trigger environments must not have: it is for local or manual runs, not for Trigger.dev.

## Environments (Trigger.dev)

| Trigger env | Deployed from | App it calls | Env vars |
|---|---|---|---|
| prod | `main` / `master` | `hust-web.hust-prod` | `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` |
| staging | `stage` | `hust-web.hust-stage` | `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` |
| preview, branch `develop` | `develop` | none | **none** (2026-09-25) |

The `develop` deploy goes to the **preview** environment, which has no env vars. There, every task
in this document falls back to `http://localhost:8443` and FAILS with `failed before a response`;
the error says `NEXT_PUBLIC_APP_URL is not set in this environment`. The same env also held about
35 PENDING/EXECUTING `sync-jobs-schedule` runs pinned to version 20260821.1. **Trigger run history
cannot verify a develop deploy.** Two ways to verify develop:

- **(a) Configure preview/develop** (a Trigger env write: claim it on `MAINTENANCE.md` first). Set
  `CRON_SECRET` to the same value as hust-dev's `hust-app-secret` (copied in-process, never
  printed) and `NEXT_PUBLIC_APP_URL=http://hust-web.hust-dev.svc.cluster.local:3000`. Then cancel
  the stuck preview runs. After that, develop verifies like the other environments. Only copy
  hust-dev's secret once it is distinct from staging's and prod's.
- **(b) Verify develop against the app directly.** From inside a `hust-web` pod in `hust-dev`,
  POST to `http://localhost:3000/api/cron/<task>` with the pod's own `CRON_SECRET` (read from its
  env inside the pod, never echoed). Treat FAILED `failed before a response` preview runs as the
  known state of that environment, not as a regression. Staging and prod are verified from Trigger
  run history.

## Emails: at least once, deduplicated by Resend

Job alerts and follow-up nudges are delivered **at least once**, and Resend's idempotency keys
collapse the repeats to one email. No schema change: each item has a marker on an existing column.

- Job alerts use `user_alerts.last_sent_at`. The minimum gaps between two sends are: daily 20 h,
  twice_daily 8 h, weekly 6 d.
- Follow-up nudges use `users.last_follow_up_nudge_at`, with the 3-day cooldown as the window.

### Job alerts: one fixed window per run

Every job-alert run has one **window end** (`windowEnd` in the request body). It is the same on
every attempt of the run:

| Run | `windowEnd` |
|---|---|
| `daily-job-alerts`, `evening-job-alerts`, `weekly-job-alerts` | the schedule's fire time (`payload.timestamp`), e.g. `2026-09-25T08:00:00.000Z` |
| `send-job-alerts` (on demand) | the run's creation time (`ctx.run.createdAt`) |
| a direct POST without `windowEnd` | the app's current time |

Trigger stores both values with the run, so a retry sends the same `windowEnd`. A dashboard replay
of a scheduled run sends it too, and then finds nothing due if the original run finished. The app
answers 400 if `windowEnd` is not an ISO 8601 date-time with an offset (`...Z` or `+hh:mm`), is
more than 5 min in the future, or is more than 8 days old.

For each alert, a run covers the period (`previous`, `windowEnd`], where `previous` is the alert's
marker. Per alert, the run does **send, then advance**:

1. The candidate query returns the active alerts whose marker is earlier than `windowEnd` minus
   the minimum gap, and reads that marker (`previous`). The cutoff is taken from `windowEnd`, not
   from the clock. So every attempt sees the same alerts, and a marker never moves backwards.
2. The digest lists the matching jobs with `created_at` in (`previous` − 10 min,
   `windowEnd` − 10 min], newest first (ties broken by id), at most 20. For a never-sent alert, the
   period starts 24 h before `windowEnd`. The 10-minute lag (`ALERT_JOBS_SETTLE_MS`) is explained
   below.
3. The run sends the digest with the key
   `job-alert/<alertId>/<previous in ms, or "first">/<windowEnd in ms>`.
4. Only after Resend has taken the email does the run move the marker to exactly `windowEnd`,
   with one conditional
   `UPDATE ... SET last_sent_at = <windowEnd> WHERE id = ? AND last_sent_at IS NOT DISTINCT FROM <previous>`
   (written as `IS NULL` / `= previous`). If an overlapping request already moved it, the update
   changes nothing.

Both ends of the period are fixed, so every attempt of a run reads the same jobs, builds the same
email and sends it under the same key. The email has nothing that depends on the attempt: the job
order is fixed and the body reads no clock. The next period starts where this one ended, so each
job falls in exactly one period.

**Why the 10-minute lag.** A job becomes visible when its insert commits, which is after its
`created_at`. Also, `windowEnd` comes from Trigger's clock, which may run ahead of the app's.
Without a lag, a job stamped just before `windowEnd` but committed after the run read the jobs
would be in neither digest. The cost is small: an 08:00 digest lists the jobs up to 07:50, and the
jobs from 07:50 to 08:00 go in the next digest.

The lag only works because the time from `created_at` to the commit is **bounded** (the jobs-writer
rule below): at most `JOBS_INSERT_MAX_LATENCY_MS` (2 min). Three clocks meet here: `created_at` is
the **database's** clock, `windowEnd` is Trigger's (checked against the app's), and the read runs
on the app's schedule. The budget assumes the database and app clocks differ by at most
`ALERT_DB_CLOCK_MAX_SKEW_MS` (60 s; NTP-synced hosts differ by milliseconds). Worst case: the run
reads no earlier than `windowEnd` − 5 min (app clock); the latest job of the period has
`created_at` = `windowEnd` − 10 min on the database's clock, which is at most `windowEnd` − 9 min
on the app's, so it committed by `windowEnd` − 7 min. A test checks
`ALERT_JOBS_SETTLE_MS > JOBS_INSERT_MAX_LATENCY_MS + ALERT_WINDOW_END_MAX_FUTURE_MS + ALERT_DB_CLOCK_MAX_SKEW_MS`
(10 min > 2 + 5 + 1 min); change one of the four only together with the others.

### The jobs-writer rule (every writer that inserts into `jobs`)

Job alerts read each period's jobs once. That is safe only if every row commits within a known
time of its `created_at`. So every INSERT into `jobs`, today and in any future sync mode:

1. **Stamps `created_at` with `JOBS_CREATED_AT`, and only with it.** Every row ends with
   `createdAt: JOBS_CREATED_AT` (imported from `@ever-hust/db`; last, so no spread can override
   it). It is the database's `statement_timestamp()`: the instant the server received the INSERT
   itself. An `ON CONFLICT DO UPDATE` never sets `created_at`, so an update keeps the first
   insert's value. Two stamps that looked fine are not: `new Date()` in JavaScript before
   `await db.insert(...)` (nothing bounds that wait; the sync did this before), and the column
   default `now()`, which is the start of the **transaction**: no timeout covers the gap between
   `BEGIN` and the `SET` below, so a client stalled there would commit a row stamped minutes in
   the past (checked: a 12 s stall after `BEGIN` gave a row committed 12 s after its `now()`
   stamp; with `JOBS_CREATED_AT` the same stall moves the stamp and the row commits within ms of it).
2. **Runs through `withBoundedJobsInsert(db, (tx) => tx.insert(jobs)...)`** from `@ever-hust/db`
   (`packages/db/src/jobs-insert.ts`). It opens a transaction whose first statement is
   `SET LOCAL statement_timeout = 60s`, `idle_in_transaction_session_timeout = 10s`,
   `synchronous_commit = local` and `TimeZone = UTC`, then runs exactly one INSERT (any
   `ON CONFLICT` / `RETURNING`, any number of rows). The 2 min bound, from the stamp to the
   commit: the INSERT's 60 s statement timeout (its timer starts with the INSERT's first protocol
   message, no later than the stamp; checked: an INSERT waiting on a row lock was cancelled 60.0 s
   after it arrived, and one whose lock was released after 30 s committed 30 s after its stamp),
   the 10 s idle gap before the COMMIT, and 50 s of slack for the COMMIT itself, which no timeout
   covers (PostgreSQL stops the statement timer before it commits): its local WAL flush.
   - `synchronous_commit = local` keeps a synchronous standby out of that COMMIT. Checked with an
     unreachable synchronous standby: without it the COMMIT waited over 5 min, ignoring the 60 s
     statement timeout, and the row became visible when the wait was cut; with it the COMMIT took
     milliseconds. The shared cluster replicates asynchronously today, so this changes nothing
     there; it keeps the bound if a synchronous replica is added.
   - `TimeZone = UTC` because `created_at` is a `timestamp` without time zone: the stamp (a
     `timestamptz`) is converted with the session's time zone (checked: 4 h off on a server set to
     `America/New_York` without the pin; exact with it).
   - A transaction that would run longer is cancelled or its session ended, and its rows never
     become visible. A batch that needs more than 60 s must be split.
   - Before running it, the helper renders the statement and refuses (rolls back) one whose rows do
     not all set `created_at` to `statement_timestamp()`, or whose conflict `set` touches it
     (`jobsInsertSqlProblem`). That covers what the source guard cannot see, such as a row built
     in another function.
3. **The callback is one expression and awaits nothing.** `(tx) => tx.insert(jobs).values(...)`
   with only `.onConflictDoUpdate` / `.onConflictDoNothing` / `.returning` after it, or a call to
   a builder declared in the same file that takes `tx: JobsInsertTx` and is itself that one
   expression. No `.then()`, no second INSERT, no other statement. Geocoding, reads and HTTP happen
   before the call, so the transaction is never idle on the client's side.
4. **No raw `INSERT INTO jobs`.**

`packages/db/src/jobs-insert-guard.test.ts` parses every source file under `apps/` and `packages/`
(tests excluded) and fails on: an INSERT into `jobs` outside the helper (table aliases included:
`import { jobs as t }`, `const t = jobs`, `const { jobs: t } = schema`); a row without the stamp;
any other `createdAt` in the values (`new Date()`, `now()`, a local copy of the SQL, a
`JOBS_CREATED_AT` not imported from the helper module or shadowed, a stamp that is not the last
key); any `createdAt` in the conflict `set`; a callback that is not one INSERT expression
(`.then()` chains, two INSERTs, extra statements); an `await` in the callback; raw SQL. The dev seed
(`packages/db/src/seed.ts`) follows the rule too, so the guard has no exceptions.

The jobs corpus sync (spec 01a, `/api/jobs/sync` and the `sync-jobs` task) has one writer:
`buildUpsertQuery(tx: JobsInsertTx, rows)` in `packages/triggers/src/ingest/job-store.ts`, called
only as `withBoundedJobsInsert(db, (tx) => buildUpsertQuery(tx, rows))` from the store's
`upsertBatch`. Per ingest batch:

- **One statement, one bounded transaction.** A multi-row `INSERT ... VALUES (...), (...)
  ON CONFLICT (external_id) DO UPDATE SET ... WHERE <changed> RETURNING ...`, which is ONE
  statement, so every row of the batch gets the same `created_at`. A batch holds at most
  `MAX_UPSERT_ROWS_PER_STATEMENT` (250) rows: the ingestor never builds a larger one and the store
  refuses one (checked on PostgreSQL 16: 250 rows with the change predicate take milliseconds,
  far inside the 60 s statement timeout).
- **Stamp and conflict set.** Every row ends with `createdAt: JOBS_CREATED_AT`; the conflict
  `set` (`upsertSet()`) never lists `created_at`, so a rewritten row keeps its first insert's stamp.
- **Skip unchanged.** The `WHERE` of the `DO UPDATE` (`... IS DISTINCT FROM ...`, plus the weekly
  last-seen refresh and the merge-takeover rule) is unchanged by the rule: an unchanged row is not
  rewritten at all.
- **Fallback.** When the batch statement fails, the ingestor retries row by row, each row its own
  bounded transaction (one INSERT each). The reads (existence, dedup probe, stored coordinates) and
  Google geocoding all happen before the transaction opens.

The column keeps its `now()` default (no migration); no writer relies on it any more.

### Follow-up nudges

Nudges also send, then advance, with the key
`follow-up-nudge/<userId>/<previous last_follow_up_nudge_at in ms, or "first">`. The marker moves
to the run's time. Nudges cannot lose an item between attempts: each run recomputes what is due
from the applications themselves, and sending a nudge does not change them. If an application
becomes due between two attempts, it is missing from the email that went out, but it is still due
at the next run after the cooldown.

### What each failure does

Resend delivers at most one email per key. It answers a repeat with the same payload with the
original response, and sends nothing new. It answers a repeat with a different payload with a 409
`invalid_idempotent_request`. That 409 counts as `deduplicated`, and the marker still advances.

- **The send fails.** The marker is untouched; the run counts it in `failed` and answers
  non-2xx. The Trigger retry sends the same email with the same key. If the first attempt was in
  fact accepted and only the response was lost, Resend dedupes the retry.
- **The process dies (or the database write fails) between the send and the advance.** The
  marker is untouched, so the retry repeats the same email with the same key, and Resend answers
  with the original response. No period is skipped. A job created in the meantime is later than
  `windowEnd`, so it is not in the retry's period either: it goes in the next one.
- **The period's content changed between two attempts** (a job in it was edited or deleted, or the
  alert was edited). The retry's payload differs, Resend answers 409, and the marker moves to
  `windowEnd`. That is correct: the email that went out covered the same period.
- **Two attempts of one run overlap** (for example a Trigger retry after a timed-out attempt whose
  request is still running). Both send the same key, and the user gets one email. If Resend reports
  the key as still being processed (409 `concurrent_idempotent_requests`), the second attempt does
  **not** record the period for the first. It counts the item as `skippedInFlight` and answers
  non-2xx. The retry then finds the period recorded, or sends again with the same key.
- **Two different runs overlap** (for example a manual `send-job-alerts` during the 08:00 run).
  They have different window ends, so different keys, and both emails go out. The first
  conditional advance wins, and the other run counts the item as `deduplicated`. Nothing is
  skipped; the next period repeats at most the jobs between the two window ends. Different runs
  must not share a key: with a shared key, Resend would refuse the later run's email (which has
  more jobs) as a repeat of the earlier one, and the extra jobs would be lost.

Counters: `sent` means Resend accepted the email and this run recorded the period. `deduplicated`
means Resend reported the key as used, or an overlapping request recorded a period first. The job
alerts response also returns the run's `windowEnd`.

Limits of the guarantee:

- **Resend remembers a key for 24 h, and a job-alert key belongs to one run.** Trigger retries
  come minutes apart, so a crash or a failed database write between the send and the advance is
  covered. But if every retry fails to advance the marker (for example, the database is down for
  the whole retry chain), the next scheduled run sends its own digest for the longer period
  (`previous`, its `windowEnd`] under its own key, and the **user gets the earlier jobs a second
  time**. For nudges, the next daily run reuses the key, but 24 h later, when the key has usually
  expired, so the result is the same. This is the price of at-least-once: a duplicate digest in a
  rare double failure, instead of a silently missed one.
- The markers are only written by this code, always from a JS `Date` (millisecond precision), so
  `= previous` matches exactly. A job-alert marker is the run's `windowEnd`, parsed into a `Date`
  first, so digits below the millisecond in the request are dropped before it is used or stored.
  **Do not write these columns with SQL `now()`** (microseconds). The conditional advance would
  then never match, and the item would be resent every run.

Retries:

- Alerts and nudges keep the default Trigger retries (3). The markers and keys make retries safe,
  and the retries are what finish a run that failed part-way.
- `batch-evaluate` is set to `retry: { maxAttempts: 1 }`, because every evaluation is a paid LLM
  call. To finish a failed run, re-trigger it with the `retryJobIds` from its error (the `failed`
  and `deferred` ids). Never include the `interrupted` ids without checking them first (see Time
  limits).
- Funnel snapshots write at most one scheduled snapshot per user per UTC day. The advisory lock
  makes the check-then-insert atomic, so a retry does not duplicate points.

## Follow-up nudges: `FOLLOW_UP_NUDGES_ENABLED` (off by default)

Set this on the **app**, not in Trigger.dev. Only `true`, `1`, `yes` or `on` enable the digest.
Unset, empty or anything else keeps it off: the run answers 200 with `skipped: "disabled"` and
makes no database query. The Trigger run shows COMPLETED.

The nudge email has never been sent in any environment, and it is not ready to be turned on:

- **No working opt-out.** The only opt-out is `preferences.followUpNudges === false`, but
  `userPreferencesSchema` (`apps/web/lib/api-schemas.ts`) does not include that key, so
  `PATCH /api/user/settings` strips it. No settings UI sets it, and the email's settings link points
  to `/settings`, which has no toggle.
- **No repeat cap.** A nudge never updates `applications.followUpCount` or `lastFollowUpAt`, so the
  3-follow-up cap never triggers. An application that stays in applied, screening or interviewing
  would be nudged every 3 days, forever.
- **No subscription gate.** Unlike job alerts, the nudge does not check `subscriptionStatus`.

Before setting `FOLLOW_UP_NUDGES_ENABLED=true`: add `followUpNudges` to the preferences schema and
a settings toggle, and add a cap (stop after N nudges per application, or record each nudge on the
application).

## Cleanup: `JOBS_CLEANUP_MODE`

Set this on the **app**, not in Trigger.dev.

| Value | Behaviour |
|---|---|
| `dry-run` (**default**, and used when the value is unset or not recognised) | Counts what each rule would delete, plus how many rows the reference guards protect. Deletes nothing. |
| `delete` | Deletes in batches of 500 rows per statement, one short transaction per batch, with at most 400 batches per rule per run, within the 240 s budget. |
| `off` | Does nothing and makes no database queries. |

The mode applies to all three retention areas. A request body `{ "mode": "dry-run" | "off" }` (or
the same Trigger payload for `cleanup` or `cleanup-expired-jobs`) can make a single run **safer**
than the configured mode. It can never switch a run to `delete`.

If a delete batch fails part-way, the run returns a 500 whose `details` still count the rows that
earlier, committed batches deleted (`deleted`, with `failed: true` on that rule).

### Retention rules

These rules are the same as before. The only change is the reference guards.

- **Jobs, expired:** `expires_at IS NOT NULL AND expires_at < now`.
- **Jobs, stale:** `(date_posted IS NULL OR date_posted < now − 90 d) AND updated_at < now − 90 d`.
- **agent_instances:** `status IN ('completed','failed') AND updated_at < now − 7 d`, and not
  referenced by an application.
- **stripe_webhook_events:** `processed_at < now − 7 d`. Nothing references this table, and a unit
  test keeps that true.

### Reference guards (data safety)

In the Drizzle schema, `user_jobs`, `applications` and `evaluations` reference `jobs.id` with
`ON DELETE CASCADE`, and `agent_instances` and `email_messages` reference it with `SET NULL`.
Deleting a referenced job would silently delete users' saved and applied jobs, their application
tracking and their evaluations. `applications.agent_instance_id` references `agent_instances.id`
with `SET NULL`: deleting an old agent run would detach it from the application it produced.

A read-only catalog check on 2026-09-25 found that the live `hust`, `hust_stage` and `hust_dev`
databases have **no foreign-key constraints at all**. There, a delete would orphan those rows
instead: the saved or applied job disappears from every join. The loss is the same either way. So:

- **A referenced row is never deleted.** Every jobs statement carries one
  `NOT EXISTS (SELECT 1 FROM <table> WHERE <table>.job_id = jobs.id)` per column in
  `JOB_REFERENCING_COLUMNS`. Every agent_instances statement carries the same for
  `AGENT_INSTANCE_REFERENCING_COLUMNS` (`packages/triggers/src/work/cleanup.ts`).
- The run refuses to start (non-2xx, nothing counted or deleted) if any of these finds a reference
  to `jobs` or `agent_instances` that the lists do not cover:
  - the Drizzle schema's foreign keys;
  - the **live** foreign keys (`pg_constraint`);
  - the **live** columns by name and type: `job_id` / `*_job_id` integer columns and
    `agent_instance_id` / `*_agent_instance_id` uuid columns in ordinary tables of the same schema.
    This is the check that matters on the live databases, which have no foreign keys. It catches a
    reference column added by hand-written SQL, `scripts/ensure-*.cjs`, or a `drizzle-kit push`
    that stopped before creating the constraints.

  A unit test fails for the same reason. So **when you add a column that references `jobs` or
  `agent_instances`, add it to the matching list**.
- Each jobs batch closes the race between the check and the delete:
  1. It locks the candidate rows with `SELECT ... FOR UPDATE SKIP LOCKED`.
  2. It runs `DELETE ... WHERE id IN (locked) AND <guard>`, which checks the guard again with a
     fresh snapshot.

  Where the FK constraints exist, a concurrent favorite, apply or evaluate must wait for the lock
  and then fails with an FK error. It is never silently cascaded away. Without FK constraints (the
  live databases today), the only remaining gap is a reference committed during that single
  `DELETE` statement. The agent_instances delete is a single statement, with the same gap.

### Turning deletes on, and turning them off again

The value reaches the app like this: the app's secret store → External Secrets (hourly refresh) →
Secret `hust-app-secret` → the `hust-web` pods, through `envFrom`. **The pods read it only at
start.** The Deployment has no checksum annotation, so a changed Secret does nothing until the pods
restart. The same applies to `FOLLOW_UP_NUDGES_ENABLED`.

1. Leave the default (`dry-run`) and read a few `daily-cleanup` runs in Trigger.dev. Check
   `jobs.expired.matched`, `jobs.stale.matched`, `agentInstances.matched` and
   `protectedByReference`.
2. When the numbers look right, set `JOBS_CLEANUP_MODE=delete`. Either:
   - (preferred) add an explicit `env` entry `JOBS_CLEANUP_MODE` to
     `k8s-gitops/apps/hust-<env>/deploy-hust-web.json`, so the GitOps edit rolls the pods; or
   - set it in the secret store, wait for External Secrets to sync (or force a refresh), then run
     `kubectl -n hust-<env> rollout restart deploy/hust-web`.

   Both are live changes: claim them on `MAINTENANCE.md` first.
3. Check the next run's result says `"mode": "delete"`, not `dry-run`.

To stop deletes:

- **Immediately:** deactivate the `daily-cleanup` schedule for that environment in the Trigger.dev
  dashboard. The next run does not start. A run already in flight finishes its current request,
  which stops within the 240 s budget. `cleanup` and `cleanup-expired-jobs` only run on demand.
- **Durably:** set `off` or `dry-run` through one of the two paths in step 2, including the pod
  restart. Until the pods restart, they keep deleting. Confirm with the next run's `mode`.

Performance note: `user_jobs` and `agent_instances` have no index on `job_id` alone, and
`applications` has none on `agent_instance_id`. The guards are planned as anti-joins, so this is
fine at today's size. If those tables grow, add those indexes; this also speeds up the FK cascade
checks.

## Supabase Realtime (`useRealtimeJobs`)

`apps/web/hooks/use-realtime-jobs.ts` subscribes to `postgres_changes` on `public.jobs` through
Supabase Realtime. On the k8s deployment it **can never fire**, for two reasons:

- The jobs live in the CNPG cluster (`hust`, `hust_stage`, `hust_dev`), which is not a Supabase
  database.
- Those databases have no logical-replication publication (`pg_publication` is empty).

The hook is harmless, so it is left in place with a comment. Live job updates on k8s would need
another transport, such as polling or an SSE route fed by the sync endpoint.
