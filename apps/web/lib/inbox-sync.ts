import { db, emailAccounts, emailMessages, userJobs, jobs } from "@ever-hust/db";
import { and, eq, inArray } from "drizzle-orm";
import { resolveMailConfig, type EmailAccountRow } from "./inbox";
import { fetchRecent } from "./mail";
import { MailHostRefusedError } from "./mail-host-guard";
import { classifyEmail, senderDomain, urlDomain } from "./email-classify";
import { advanceApplicationStage } from "./application-pipeline";

interface JobMatch {
  id: number;
  name: string | null;
  domain: string | null;
}

/** The one job all matches point at, or null when there are none or several. */
function onlyJob(matches: JobMatch[]): number | null {
  const ids = new Set(matches.map((m) => m.id));
  return ids.size === 1 ? matches[0]!.id : null;
}

/**
 * Best-effort: link an email to one of the user's applied/saved jobs. Links
 * only when exactly one job matches. The linked job's application can be moved
 * (to "rejected", say) by the caller, so when two jobs match (two roles at the
 * same company, or two companies named in one email) nothing is linked.
 */
export function matchJob(
  candidates: JobMatch[],
  fromAddr: string | null,
  subject: string | null,
  body: string | null,
): number | null {
  const domain = senderDomain(fromAddr);
  if (domain) {
    // Exact host or a true subdomain ("mail.box.com"); never a bare suffix
    // ("dropbox.com" must not match "box.com").
    const byDomain = candidates.filter(
      (c) => c.domain && (domain === c.domain || domain.endsWith("." + c.domain)),
    );
    // The sender is the company: when its domain fits several jobs, do not
    // fall back to the name, which would only guess between them.
    if (byDomain.length > 0) return onlyJob(byDomain);
  }
  const hay = `${fromAddr ?? ""} ${subject ?? ""} ${body ?? ""}`.toLowerCase();
  const byName = candidates.filter((c) => {
    const n = (c.name ?? "").trim().toLowerCase();
    if (n.length < 4) return false;
    // Whole-word match so "meta" does not hit "metadata". Lookarounds rather
    // than \b so names ending in a symbol (e.g. "c++") still match.
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(hay);
  });
  return onlyJob(byName);
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
  let cfg;
  try {
    cfg = await resolveMailConfig(account, "imap");
  } catch (err) {
    if (!(err instanceof MailHostRefusedError)) throw err;
    // A temporary DNS failure must not park the account (cron only syncs
    // "connected" accounts); leave its status alone and retry next run.
    if (err.transient) return { fetched: 0, stored: 0, error: err.message };
    await db
      .update(emailAccounts)
      .set({ status: "error", lastError: err.message, updatedAt: new Date() })
      .where(eq(emailAccounts.id, account.id))
      .catch(() => {});
    return { fetched: 0, stored: 0, error: err.message };
  }
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
    // The connect-time host re-check can also hit a temporary DNS failure; like the
    // resolve step above, that must not park the account.
    if (err instanceof MailHostRefusedError && err.transient) return { fetched: 0, stored: 0, error: err.message };
    // lastError is returned to the client (publicAccount), so store a generic text:
    // the driver message can carry addresses, ports and server banners.
    if (!(err instanceof MailHostRefusedError)) console.warn(`[inbox-sync] account ${account.id}:`, msg);
    const lastError =
      err instanceof MailHostRefusedError
        ? err.message
        : "Could not sync your mailbox. Check your connection settings.";
    await db
      .update(emailAccounts)
      .set({ status: "error", lastError, updatedAt: new Date() })
      .where(eq(emailAccounts.id, account.id))
      .catch(() => {});
    return { fetched: 0, stored: 0, error: msg };
  }
}
