# Hust database schema reconcile (indexes + foreign keys)

**Applied:** 2026-09-25 to `hust_dev`, `hust_stage` and `hust` (prod), in that order.

## Why this exists

The databases were created in July 2026 with `drizzle-kit push`. That push aborted partway through:
it tried to drop the `pg_stat_statements_info` view, which belongs to the `pg_stat_statements`
extension installed in `public`. By then every table and column had been created, but none of the
**35 foreign keys** and **54 indexes** that `packages/db/src/schema` declares.

As a result, the declared `ON DELETE CASCADE` / `SET NULL` behaviour did not exist, and deletes
**orphaned** child rows instead of cascading. Queries that assume the declared indexes were doing
sequential scans.

`reconcile.sql` adds exactly what the Drizzle schema declares, using the same names and definitions.
It generates those from a `drizzle-kit push` into an empty database.

## Files

| File | Purpose |
|---|---|
| `reconcile.sql` | Idempotent and additive. See the notes below. |
| `verify.sql` | Read-only. Summary row is all zeros when the database matches the schema. |
| `rollback.sql` | Drops the 35 foreign keys and 54 indexes that reconcile added, by their declared names. Has the same guard as `reconcile.sql`. Only for a real incident. |

Notes on `reconcile.sql`:
- Indexes are built with `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.
- Foreign keys are added as `NOT VALID`. `VALIDATE` then runs only on keys whose orphan count is 0.
- It never drops anything and never changes data. Orphan rows are reported, never deleted.
- Before a foreign key is added, every FK already on the same column is compared on its full
  definition: child columns, parent table and columns, `ON DELETE`, `ON UPDATE`, match type and
  deferrability. If one is identical under another name, the declared FK is skipped with a
  NOTICE. If one differs (for example `ON DELETE CASCADE` where `SET NULL` is declared), the
  declared FK is **not** added, because two FKs with different actions on one column would
  conflict. The script raises a `fk CONFLICT` WARNING that names both FKs, and `verify.sql`
  reports it as `fks_mismatch`. Resolving it is an owner decision.
- A guard aborts before any change if it is connected to a replica, to a database other than
  `hust`, `hust_stage` or `hust_dev`, or to a database without the Hust tables. `rollback.sql`
  runs the same guard before its first `DROP`. For a throwaway test copy only, allow its name with
  `PGOPTIONS='-c hust.reconcile_allow_db=<name>'`.

## How to run

Run one database at a time on the **primary**, outside any transaction. Never use `-1` or `BEGIN`,
because `CONCURRENTLY` cannot run inside a transaction. Run as the table owner, which is the role
with the same name as the database:

```bash
psql -X -v ON_ERROR_STOP=1 -d hust -c "SET ROLE hust" -f reconcile.sql
psql -X -d hust -f verify.sql     # summary row must be all zeros
```

**Before running it on a shared cluster:**
- Prove that a recent restorable backup exists.
- Check that no transaction in the target database has been open for a long time, because each
  concurrent index build waits for open transactions.

## Behaviour that changed when the foreign keys went live

- **Deleting a user now cascades** to that user's sessions, accounts, chats, applications,
  evaluations, credit transactions, e-mail accounts and messages, API keys, alerts and so on, as
  declared. Before this, those rows were orphaned.
- **Deleting a job cascades** to `user_jobs`, `applications` and `evaluations`, and sets
  `agent_instances.job_id` / `email_messages.job_id` to NULL. The scheduled jobs cleanup
  (`packages/triggers/src/work/cleanup.ts`) guards every delete with `NOT EXISTS` on all referencing
  columns, so it never triggers these cascades.
- **Writes that point at a missing parent** now fail with SQLSTATE `23503` instead of silently
  creating an orphan.

## Do not use `drizzle-kit push` against these databases

It tries to drop the extension-owned `pg_stat_statements_info` view in `public`. That is the July
failure. Until the extension is moved out of `public`, or push is given a `tablesFilter`, make schema
changes with ensure-scripts or this reconcile pattern.
