/**
 * Idempotently ensure the `credit_transactions` ledger exists (credit metering,
 * item 14).
 *
 * The prod database is `drizzle-kit push`-managed (empty migration journal), so
 * `drizzle-kit migrate` can't be used. This applies only additive, idempotent
 * DDL — safe to run repeatedly and non-destructive.
 *
 * Usage: DATABASE_URL=... node scripts/ensure-credit-tables.cjs
 */
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS "credit_transactions" (
      "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "delta" integer NOT NULL,
      "reason" text NOT NULL,
      "model_key" text,
      "input_tokens" integer,
      "output_tokens" integer,
      "cost_micro_usd" integer,
      "period_key" text,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "credit_tx_user_idx" ON "credit_transactions" ("user_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "credit_tx_user_created_idx" ON "credit_transactions" ("user_id","created_at")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "credit_tx_grant_unique" ON "credit_transactions" ("user_id","reason","period_key")`;
  console.log("ok: credit_transactions ensured");
  await sql.end({ timeout: 5 });
})().catch(async (e) => {
  console.error("failed to ensure credit_transactions:", e && e.message ? e.message : e);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
