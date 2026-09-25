import { db, emailAccounts } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { apiSuccess, apiError } from "../../../../lib/api-response";
import { syncAccount } from "../../../../lib/inbox-sync";
import { verifyCronRequest } from "../../../../lib/cron-auth";

export const maxDuration = 300;

/**
 * POST — background sync of ALL connected mailboxes. Guarded by CRON_SECRET
 * (Authorization: Bearer <secret> or x-cron-secret) through the shared cron guard:
 * constant-time comparison, fail closed (503) when CRON_SECRET is unset in
 * production, open when it is unset in local dev. Called by the Trigger.dev
 * schedule (or any external cron).
 */
export async function POST(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  try {
    const accounts = await db
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.status, "connected"))
      .limit(2000);

    let synced = 0;
    let stored = 0;
    let failed = 0;
    // Sequential to bound concurrent IMAP connections.
    for (const account of accounts) {
      const r = await syncAccount(account.userId, account);
      if (r.error && r.fetched === 0 && r.stored === 0) failed++;
      else {
        synced++;
        stored += r.stored;
      }
    }
    return apiSuccess({ accounts: accounts.length, synced, stored, failed });
  } catch (err) {
    console.error("[api/inbox/cron-sync] failed:", err instanceof Error ? err.message : err);
    return apiError("Cron sync failed");
  }
}
