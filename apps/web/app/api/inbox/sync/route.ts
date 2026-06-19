import { db, emailAccounts, emailMessages } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";
import { loadAccount, toMailConfig } from "../../../../lib/inbox";
import { fetchRecent } from "../../../../lib/mail";

export const maxDuration = 60;

/** POST — pull recent INBOX messages over IMAP and store them. */
export async function POST() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const rl = applyRateLimit(user.id, "authenticated");
  if (rl) return rl;

  const account = await loadAccount(user.id);
  if (!account) return apiError("No email account connected", 400);
  const cfg = toMailConfig(account);
  if (!cfg) return apiError("Email encryption is not configured on the server.", 500);

  try {
    const messages = await fetchRecent(cfg, 40);
    let stored = 0;
    for (const m of messages) {
      const res = await db
        .insert(emailMessages)
        .values({
          userId: user.id,
          accountId: account.id,
          uid: m.uid,
          messageId: m.messageId,
          threadKey: m.threadKey,
          direction: "inbound",
          fromAddr: m.fromAddr,
          toAddrs: m.toAddrs,
          subject: m.subject,
          snippet: m.snippet,
          bodyText: m.bodyText,
          bodyHtml: m.bodyHtml,
          sentAt: m.sentAt,
        })
        .onConflictDoNothing()
        .returning({ id: emailMessages.id });
      if (res.length > 0) stored++;
    }

    await db
      .update(emailAccounts)
      .set({ lastSyncedAt: new Date(), status: "connected", lastError: null, updatedAt: new Date() })
      .where(eq(emailAccounts.id, account.id));

    return apiSuccess({ fetched: messages.length, stored });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/inbox/sync] failed:", msg);
    await db
      .update(emailAccounts)
      .set({ status: "error", lastError: msg.slice(0, 500), updatedAt: new Date() })
      .where(eq(emailAccounts.id, account.id))
      .catch(() => {});
    return apiError("Failed to sync your mailbox. Check your connection settings.");
  }
}
