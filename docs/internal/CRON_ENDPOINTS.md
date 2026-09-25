# Cron endpoints & the cleanup mode

_Last updated: 2026-09-25_

Hust's scheduled and background tasks are defined in Trigger.dev (`packages/triggers/src`), but
**the work runs inside the web app**. The Trigger.dev environment carries only two variables,
`CRON_SECRET` and `NEXT_PUBLIC_APP_URL` (the in-cluster app URL,
`http://hust-web.hust-<env>.svc.cluster.local:3000`). A Trigger task therefore never touches the
database, Resend or an LLM itself. It POSTs to an app endpoint and the app does the work.

Until 2026-09 six schedules opened the database from the Trigger worker and failed every run with
`DATABASE_URL environment variable is required`. Those schedules were `daily-cleanup`,
`daily-job-alerts`, `evening-job-alerts`, `weekly-job-alerts`, `daily-follow-up-nudges` and
`daily-funnel-snapshots`.

## Endpoints

| Trigger task(s) | Endpoint | Work (app runtime) | Trigger timeout |
|---|---|---|---|
| `daily-cleanup` (03:00 UTC), `cleanup` | `POST /api/cron/cleanup` | `runCleanup` | 290 s |
| `cleanup-expired-jobs` (on demand) | `POST /api/cron/cleanup-expired-jobs` | `cleanupExpiredJobs` | 290 s |
| `daily-job-alerts` (08:00), `evening-job-alerts` (18:00), `weekly-job-alerts` (Mon 08:00), `send-job-alerts` | `POST /api/cron/job-alerts` `{ frequencies: [...] }` | `runJobAlerts` | 290 s |
| `daily-follow-up-nudges` (09:00), `follow-up-nudges` | `POST /api/cron/follow-up-nudges` | `runFollowUpNudges` | 290 s |
| `daily-funnel-snapshots` (02:00), `funnel-snapshots` | `POST /api/cron/funnel-snapshots` | `processFunnelSnapshots` | 180 s |
| `batch-evaluate` (on demand) | `POST /api/cron/batch-evaluate` `{ userId, jobIds, scoreFloor?, max? }` | `runBatchEvaluate` | 290 s |
| `inbox-sync-hourly`, `inbox-sync` | `POST /api/inbox/cron-sync` | inbox IMAP sync | 290 s |
| `sync-jobs-schedule` | `POST /api/jobs/sync` | jobs corpus sync | (owned by the sync rewrite) |

- **Code layout.** The work functions live in `packages/triggers/src/work/*`, exported as
  `@ever-hust/triggers/work`. That entry point never imports `@trigger.dev/sdk`, and a test checks
  this. The task files only call `callAppEndpoint()` (`packages/triggers/src/app-endpoint.ts`). The
  paths are listed in `packages/triggers/src/cron-endpoints.ts`, and a test checks that each one has
  a route file.
- **One route per task.** Each route has its own `maxDuration`, which Next.js only accepts as a
  static per-route export. Each route also gets its own logs, and a problem in one route cannot
  affect the others. The routes share `createCronHandler()` (`apps/web/lib/cron-route.ts`).
- **Auth.** Every endpoint uses `verifyCronRequest()` (`apps/web/lib/cron-auth.ts`):
  - The secret is read from `Authorization: Bearer <CRON_SECRET>`, or from the legacy
    `x-cron-secret` header.
  - The secret is compared in constant time: both sides are SHA-256 hashed, then compared with
    `timingSafeEqual`.
  - If `CRON_SECRET` is unset and `NODE_ENV=production`, the endpoint **fails closed** with a 503.
  - If `CRON_SECRET` is unset outside production, the endpoint stays open for local development.
  - `/api/jobs/sync` still uses its own guard. It belongs to the sync rewrite and should adopt
    this guard when that work lands.
- **Failures are never reported as a 2xx.** The task's `callAppEndpoint()` throws on any non-2xx
  response, network error or timeout, so the Trigger run shows **FAILED**. A partial failure
  (some emails failed, or the time budget ran out) returns a 500 with the counters in `details`.
  A bad request body returns 400. An unknown user in `batch-evaluate` returns 404.
- **Time limits.** Node's `fetch` (undici) drops a response whose headers take longer than 300 s,
  so trigger-side timeouts are capped at 290 s. The app-side work stops after a 240 s budget:
  - Cleanup reports `truncated: true` and the next day's run continues.
  - Alerts, nudges and batch-evaluate report the remaining items as `deferred` and return a
    non-2xx. For alerts and nudges, the Trigger retry then picks up where the run stopped.

## Emails are sent at most once per period

This uses existing columns and needs no schema change.

- **Job alerts** use `user_alerts.last_sent_at`. Before sending, the run claims the alert with one
  conditional `UPDATE ... WHERE last_sent_at IS NULL OR last_sent_at < now - window RETURNING id`.
  The windows are: daily 20 h, twice_daily 8 h, weekly 6 d.
- **Follow-up nudges** use `users.last_follow_up_nudge_at` in the same way, with the 3-day cooldown
  as the window.
- If a Trigger retry, a manual re-run or an overlapping run reaches an alert or user that was
  already claimed, it skips it.
- If the email fails, the claim is released so that the retry sends that one only.
- The tradeoff is at-most-once delivery. If the process dies between the claim and the send, that
  user misses one digest rather than getting two.
- Both tasks keep the default Trigger retries (3). The claims make retries safe, and the retries
  are what finish a run that failed part-way.
- `batch-evaluate` is set to `retry: { maxAttempts: 1 }`, because every evaluation is a paid LLM
  call. To finish a failed run, re-trigger it with the `failed` and `deferred` job ids from its
  error.
- Funnel snapshots write at most one scheduled snapshot per user per UTC day, so a retry does not
  duplicate points.

## Cleanup: `JOBS_CLEANUP_MODE`

Set this on the **app**, not in Trigger.dev.

| Value | Behaviour |
|---|---|
| `dry-run` (**default**, and used when the value is unset or not recognised) | Counts what each rule would delete, plus how many rows the reference guard protects. Deletes nothing. |
| `delete` | Deletes in batches of 500 rows per statement, one short transaction per batch, with at most 400 batches per rule per run, within the 240 s budget. |
| `off` | Does nothing and makes no database queries. |

The mode applies to all three retention areas. A request body `{ "mode": "dry-run" | "off" }` (or
the same Trigger payload for `cleanup` or `cleanup-expired-jobs`) can make a single run **safer**
than the configured mode. It can never switch a run to `delete`.

### Retention rules

These rules are the same as before. The only change is the reference guard.

- **Jobs, expired:** `expires_at IS NOT NULL AND expires_at < now`.
- **Jobs, stale:** `(date_posted IS NULL OR date_posted < now − 90 d) AND updated_at < now − 90 d`.
- **agent_instances:** `status IN ('completed','failed') AND updated_at < now − 7 d`.
- **stripe_webhook_events:** `processed_at < now − 7 d`.

### Reference guard (data safety)

In the Drizzle schema, `user_jobs`, `applications` and `evaluations` reference `jobs.id` with
`ON DELETE CASCADE`, and `agent_instances` and `email_messages` reference it with `SET NULL`.
Deleting a referenced job would silently delete users' saved and applied jobs, their application
tracking and their evaluations.

A read-only catalog check on 2026-09-25 found that the live `hust`, `hust_stage` and `hust_dev`
databases have **no foreign-key constraints at all**. There, a delete would orphan those rows
instead: the saved or applied job disappears from every join. The loss is the same either way. So:

- **A job referenced by any foreign key is never deleted.** Every jobs statement carries one
  `NOT EXISTS (SELECT 1 FROM <table> WHERE <table>.job_id = jobs.id)` per column in
  `JOB_REFERENCING_COLUMNS` (`packages/triggers/src/work/cleanup.ts`).
- The run refuses to start (non-2xx, nothing touched) if either of these has a foreign key to
  `jobs` that the list does not cover:
  - the Drizzle schema;
  - the **live** database (`pg_constraint`).

  A unit test fails for the same reason. So **when you add a foreign key to `jobs`, add the column
  to `JOB_REFERENCING_COLUMNS`**.
- Each batch closes the race between the check and the delete:
  1. It locks the candidate rows with `SELECT ... FOR UPDATE SKIP LOCKED`.
  2. It runs `DELETE ... WHERE id IN (locked) AND <guard>`, which checks the guard again with a
     fresh snapshot.

  Where the FK constraints exist, a concurrent favorite, apply or evaluate must wait for the lock
  and then fails with an FK error. It is never silently cascaded away. Without FK constraints (the
  live databases today), the only remaining gap is a reference committed during that single
  `DELETE` statement.

### Turning deletes on

1. Leave the default (`dry-run`) and read a few `daily-cleanup` runs in Trigger.dev. Check
   `jobs.expired.matched`, `jobs.stale.matched` and `protectedByReference`.
2. When the numbers look right, set `JOBS_CLEANUP_MODE=delete` in the app env through GitOps.
3. To roll back, set `off` or `dry-run`. No redeploy of the tasks is needed.

Performance note: `user_jobs` and `agent_instances` have no index on `job_id` alone. The guard is
planned as an anti-join, so this is fine at today's size. If those tables grow, add
`user_jobs(job_id)` and `agent_instances(job_id)` indexes; this also speeds up the FK cascade
checks.

## Supabase Realtime (`useRealtimeJobs`)

`apps/web/hooks/use-realtime-jobs.ts` subscribes to `postgres_changes` on `public.jobs` through
Supabase Realtime. On the k8s deployment it **can never fire**, for two reasons:

- The jobs live in the CNPG cluster (`hust`, `hust_stage`, `hust_dev`), which is not a Supabase
  database.
- Those databases have no logical-replication publication (`pg_publication` is empty).

The hook is harmless, so it is left in place with a comment. Live job updates on k8s would need
another transport, such as polling or an SSE route fed by the sync endpoint.
