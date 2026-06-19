/**
 * Idempotently ensure the Inbox tables exist (email_accounts, email_messages).
 *
 * Prod DB is `drizzle-kit push`-managed, so we apply additive, idempotent DDL
 * here rather than via migrate. Safe to run repeatedly.
 *
 * Usage: DATABASE_URL=... node scripts/ensure-email-tables.cjs
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
    CREATE TABLE IF NOT EXISTS "email_accounts" (
      "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "user_id" text NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
      "email" text NOT NULL,
      "username" text NOT NULL,
      "password_enc" text NOT NULL,
      "imap_host" text NOT NULL,
      "imap_port" integer NOT NULL DEFAULT 993,
      "imap_secure" boolean NOT NULL DEFAULT true,
      "smtp_host" text NOT NULL,
      "smtp_port" integer NOT NULL DEFAULT 465,
      "smtp_secure" boolean NOT NULL DEFAULT true,
      "status" text NOT NULL DEFAULT 'connected',
      "last_error" text,
      "last_synced_at" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "email_accounts_user_idx" ON "email_accounts" ("user_id")`;

  await sql`
    CREATE TABLE IF NOT EXISTS "email_messages" (
      "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "account_id" integer NOT NULL REFERENCES "email_accounts"("id") ON DELETE CASCADE,
      "uid" integer,
      "message_id" text,
      "thread_key" text,
      "direction" text NOT NULL,
      "from_addr" text,
      "to_addrs" text,
      "subject" text,
      "snippet" text,
      "body_text" text,
      "body_html" text,
      "sent_at" timestamp,
      "seen" boolean NOT NULL DEFAULT false,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "email_messages_user_idx" ON "email_messages" ("user_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "email_messages_account_idx" ON "email_messages" ("account_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "email_messages_thread_idx" ON "email_messages" ("user_id","thread_key")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "email_messages_msgid_unique" ON "email_messages" ("account_id","message_id")`;

  console.log("ok: email_accounts + email_messages ensured");
  await sql.end({ timeout: 5 });
})().catch(async (e) => {
  console.error("failed to ensure email tables:", e && e.message ? e.message : e);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
