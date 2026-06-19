import { db, emailAccounts, emailMessages, userJobs, jobs } from "@ever-hust/db";
import { and, eq, inArray } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";
import { loadAccount, toMailConfig } from "../../../../lib/inbox";
import { fetchRecent } from "../../../../lib/mail";
import { classifyEmail, senderDomain, urlDomain } from "../../../../lib/email-classify";

interface JobMatch {
  id: number;
  name: string | null;
  domain: string | null;
}

/** Best-effort: link an email to one of the user's applied/saved jobs. */
function matchJob(
  candidates: JobMatch[],
  fromAddr: string | null,
  subject: string | null,
  body: string | null,
): number | null {
  const domain = senderDomain(fromAddr);
  if (domain) {
    const byDomain = candidates.find((c) => c.domain && domain.endsWith(c.domain));
    if (byDomain) return byDomain.id;
  }
  const hay = `${fromAddr ?? ""} ${subject ?? ""} ${body ?? ""}`.toLowerCase();
  const byName = candidates.find((c) => {
    const n = (c.name ?? "").trim().toLowerCase();
    return n.length >= 4 && hay.includes(n);
  });
  return byName?.id ?? null;
}

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

    // Candidate jobs to link replies to (applied/saved), fetched once per sync.
    const candidates: JobMatch[] = (
      await db
        .select({ id: jobs.id, name: jobs.companyName, url: jobs.companyUrl })
        .from(userJobs)
        .innerJoin(jobs, eq(userJobs.jobId, jobs.id))
        .where(and(eq(userJobs.userId, user.id), inArray(userJobs.status, ["applied", "favorited"])))
        .limit(300)
    ).map((r) => ({ id: r.id, name: r.name, domain: urlDomain(r.url) }));

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
          category: classifyEmail(m.subject, m.bodyText ?? m.snippet),
          jobId: matchJob(candidates, m.fromAddr, m.subject, m.bodyText ?? m.snippet),
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
