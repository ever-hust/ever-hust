import { tool } from "ai";
import { z } from "zod";
import { db, emailMessages } from "@ever-hust/db";
import { and, desc, eq } from "drizzle-orm";

/**
 * Read-only inbox tools so the orchestrator can triage the user's connected
 * mailbox ("what interview invites do I have?", "summarize the recruiter
 * emails", "what did Acme say?"). Sending is a user/UI action (or the
 * "Draft with AI" flow) — these tools never send.
 */

export const getInboxThreadsTool = tool({
  description:
    "List the user's recent email conversations from their connected inbox (subject, latest sender, snippet, message count). Use to summarize the inbox or find a specific thread before reading it with getInboxThread.",
  inputSchema: z.object({
    userId: z.string().optional(), // injected server-side
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: async ({ userId, limit = 20 }) => {
    if (!userId) return { connected: false, threads: [] };
    try {
      const rows = await db
        .select({
          threadKey: emailMessages.threadKey,
          subject: emailMessages.subject,
          fromAddr: emailMessages.fromAddr,
          snippet: emailMessages.snippet,
          direction: emailMessages.direction,
          sentAt: emailMessages.sentAt,
        })
        .from(emailMessages)
        .where(eq(emailMessages.userId, userId))
        .orderBy(desc(emailMessages.sentAt), desc(emailMessages.createdAt))
        .limit(200);

      if (rows.length === 0) return { connected: false, threads: [] };

      const byThread = new Map<string, { threadKey: string; subject: string | null; lastFrom: string | null; snippet: string | null; count: number }>();
      for (const r of rows) {
        const key = r.threadKey || r.subject || "(no subject)";
        const t = byThread.get(key);
        if (t) {
          t.count++;
        } else {
          byThread.set(key, {
            threadKey: key,
            subject: r.subject,
            lastFrom: r.direction === "inbound" ? r.fromAddr : null,
            snippet: r.snippet,
            count: 1,
          });
        }
      }
      return { connected: true, threads: Array.from(byThread.values()).slice(0, limit) };
    } catch (err) {
      console.error("[inbox-tools] getInboxThreads failed:", err instanceof Error ? err.message : err);
      return { connected: false, threads: [], error: "Could not read the inbox." };
    }
  },
});

export const getInboxThreadTool = tool({
  description:
    "Read all messages in one email conversation (by its threadKey or exact subject) so you can summarize it or help draft a reply. Returns each message's sender, direction, date, and body.",
  inputSchema: z.object({
    userId: z.string().optional(), // injected server-side
    threadKey: z.string().max(300).describe("The thread key or subject from getInboxThreads"),
  }),
  execute: async ({ userId, threadKey }) => {
    if (!userId) return { found: false };
    try {
      const rows = await db
        .select({
          direction: emailMessages.direction,
          fromAddr: emailMessages.fromAddr,
          toAddrs: emailMessages.toAddrs,
          subject: emailMessages.subject,
          bodyText: emailMessages.bodyText,
          snippet: emailMessages.snippet,
          sentAt: emailMessages.sentAt,
        })
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.userId, userId),
            eq(emailMessages.threadKey, threadKey),
          ),
        )
        .orderBy(emailMessages.sentAt)
        .limit(50);

      if (rows.length === 0) return { found: false, message: "No conversation matched that thread." };
      return {
        found: true,
        messages: rows.map((r) => ({
          direction: r.direction,
          from: r.fromAddr,
          to: r.toAddrs,
          subject: r.subject,
          body: (r.bodyText ?? r.snippet ?? "").slice(0, 4000),
          sentAt: r.sentAt,
        })),
      };
    } catch (err) {
      console.error("[inbox-tools] getInboxThread failed:", err instanceof Error ? err.message : err);
      return { found: false, error: "Could not read the conversation." };
    }
  },
});
