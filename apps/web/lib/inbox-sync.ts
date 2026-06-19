import { db, emailAccounts, emailMessages, userJobs, jobs } from "@ever-hust/db";
import { and, eq, inArray } from "drizzle-orm";
import { toMailConfig, type EmailAccountRow } from "./inbox";
import { fetchRecent } from "./mail";
import { classifyEmail, senderDomain, urlDomain } from "./email-classify";
import { advanceApplicationStage } from "./application-pipeline";

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

export interface SyncResult {
  fetched: number;
  stored: number;
  error?: string;
}

/**
 * Pull recent INBOX messages for one account over IMAP, classify + link them to
 * the user's applied/saved jobs, and store new ones. Never throws — records the
 * account status and returns a summary. Shared by the on-demand sync route and
 * the background cron-sync.
 */
export async function syncAccount(userId: string, account: EmailAccountRow): Promise<SyncResult> {
  const cfg = toMailConfig(account);
  if (!cfg) return { fetched: 0, stored: 0, error: "encryption not configured" };

  try {
    const messages = await fetchRecent(cfg, 40);

    const candidates: JobMatch[] = (
      await db
        .select({ id: jobs.id, name: jobs.companyName, url: jobs.companyUrl })
        .from(userJobs)
        .innerJoin(jobs, eq(userJobs.jobId, jobs.id))
        .where(and(eq(userJobs.userId, userId), inArray(userJobs.status, ["applied", "favorited"])))
        .limit(300)
    ).map((r) => ({ id: r.id, name: r.name, domain: urlDomain(r.url) }));

    let stored = 0;
    for (const m of messages) {
      const category = classifyEmail(m.subject, m.bodyText ?? m.snippet);
      const jobId = matchJob(candidates, m.fromAddr, m.subject, m.bodyText ?? m.snippet);
      const res = await db
        .insert(emailMessages)
        .values({
          userId,
          accountId: account.id,
          uid: m.uid,
          messageId: m.messageId,
          threadKey: m.threadKey,
          direction: "inbound",
          category,
          jobId,
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
      if (res.length > 0) {
        stored++;
        // Advance the linked application's pipeline stage on a meaningful,
        // newly-stored reply (interview/offer/rejection). Advance-only; only
        // touches an existing application row.
        if (jobId) await advanceApplicationStage(userId, jobId, category);
      }
    }

    await db
      .update(emailAccounts)
      .set({ lastSyncedAt: new Date(), status: "connected", lastError: null, updatedAt: new Date() })
      .where(eq(emailAccounts.id, account.id));

    return { fetched: messages.length, stored };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(emailAccounts)
      .set({ status: "error", lastError: msg.slice(0, 500), updatedAt: new Date() })
      .where(eq(emailAccounts.id, account.id))
      .catch(() => {});
    return { fetched: 0, stored: 0, error: msg };
  }
}
