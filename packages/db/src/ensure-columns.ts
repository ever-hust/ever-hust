import postgres from "postgres";

/**
 * Ensures that all expected columns exist in the database.
 * Runs idempotent ALTER TABLE statements on startup.
 *
 * Has a hard 5-second timeout to prevent blocking app startup
 * when the database is unreachable.
 */
export async function ensureJobsColumns(databaseUrl: string): Promise<void> {
  const timeoutMs = 5_000;

  const migration = async () => {
    const sql = postgres(databaseUrl, {
      prepare: false,
      idle_timeout: 3,
      connect_timeout: 4,
      max: 1,
    });

    try {
      await sql.unsafe(`
        ALTER TABLE jobs
          ADD COLUMN IF NOT EXISTS latitude numeric,
          ADD COLUMN IF NOT EXISTS longitude numeric;
      `);
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS jobs_lat_lng_idx ON jobs (latitude, longitude);
      `);
      console.log("[db] Schema columns verified.");
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
  };

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Schema check timed out")), timeoutMs),
  );

  await Promise.race([migration(), timeout]);
}
