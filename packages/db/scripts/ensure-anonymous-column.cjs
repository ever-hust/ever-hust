/**
 * Idempotently ensure the `users.is_anonymous` column exists (BetterAuth anonymous
 * plugin / frictionless trial).
 *
 * The prod database was provisioned with `drizzle-kit push` (schema synced directly),
 * so the `__drizzle_migrations` journal is empty and `drizzle-kit migrate` tries to
 * replay 0000_* against an already-populated DB and fails. This applies only the
 * single additive, idempotent DDL needed by the deploy — safe to run repeatedly and
 * non-destructive (touches one column, never drops anything).
 *
 * Usage: DATABASE_URL=... node scripts/ensure-anonymous-column.cjs
 */
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

(async () => {
  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_anonymous" boolean NOT NULL DEFAULT false`;
  console.log("ok: users.is_anonymous ensured");
  await sql.end({ timeout: 5 });
})().catch(async (e) => {
  console.error("failed to ensure users.is_anonymous:", e && e.message ? e.message : e);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
