import { db, emailMessages } from "@ever-hust/db";
import { desc, eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";

type Row = typeof emailMessages.$inferSelect;

interface ThreadView {
  threadKey: string;
  subject: string | null;
  lastAt: string | null;
  count: number;
  messages: Row[];
}

/** GET — the user's messages grouped into conversations (newest thread first). */
export async function GET() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const rl = applyRateLimit(user.id, "authenticated");
  if (rl) return rl;

  try {
    const rows = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.userId, user.id))
      .orderBy(desc(emailMessages.sentAt), desc(emailMessages.createdAt))
      .limit(300);

    const byThread = new Map<string, ThreadView>();
    for (const r of rows) {
      const key = r.threadKey || `msg-${r.id}`;
      let t = byThread.get(key);
      if (!t) {
        t = { threadKey: key, subject: r.subject, lastAt: null, count: 0, messages: [] };
        byThread.set(key, t);
      }
      t.messages.push(r);
      t.count++;
    }

    const threads = Array.from(byThread.values()).map((t) => {
      // messages came newest-first; keep oldest-first within a thread for reading.
      t.messages.sort(
        (a, b) =>
          (a.sentAt?.getTime() ?? a.createdAt.getTime()) -
          (b.sentAt?.getTime() ?? b.createdAt.getTime()),
      );
      const last = t.messages[t.messages.length - 1]!;
      t.subject = t.messages[0]?.subject ?? t.subject;
      t.lastAt = (last.sentAt ?? last.createdAt).toISOString();
      return t;
    });
    threads.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

    return apiSuccess({ threads });
  } catch (err) {
    console.error("[api/inbox/messages] failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to load messages");
  }
}
