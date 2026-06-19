import { db, emailMessages } from "@ever-hust/db";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError, safeJsonParse } from "../../../../lib/api-response";
import { loadAccount, toMailConfig } from "../../../../lib/inbox";
import { sendMail, threadKeyFor } from "../../../../lib/mail";

export const maxDuration = 30;

/** POST — send an email (new or reply) from the connected account; store it. */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const rl = applyRateLimit(user.id, "authenticated");
  if (rl) return rl;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const b = jsonResult.data as Record<string, unknown>;

  const to = typeof b.to === "string" ? b.to.trim() : "";
  const subject = typeof b.subject === "string" ? b.subject.trim() : "";
  const text = typeof b.body === "string" ? b.body : "";
  const inReplyTo = typeof b.inReplyTo === "string" ? b.inReplyTo : undefined;
  if (!to || !to.includes("@")) return apiBadRequest("A valid recipient is required");
  if (!subject && !text) return apiBadRequest("Add a subject or a message");

  const account = await loadAccount(user.id);
  if (!account) return apiError("No email account connected", 400);
  const cfg = toMailConfig(account);
  if (!cfg) return apiError("Email encryption is not configured on the server.", 500);

  try {
    const messageId = await sendMail(cfg, {
      to,
      subject: subject || "(no subject)",
      text,
      inReplyTo,
      references: inReplyTo,
    });

    await db.insert(emailMessages).values({
      userId: user.id,
      accountId: account.id,
      messageId: messageId || `sent-${Date.now()}-${account.id}`,
      threadKey: threadKeyFor(subject),
      direction: "outbound",
      fromAddr: cfg.email,
      toAddrs: to,
      subject: subject || "(no subject)",
      snippet: text.replace(/\s+/g, " ").trim().slice(0, 200),
      bodyText: text,
      sentAt: new Date(),
      seen: true,
    });

    return apiSuccess({ sent: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/inbox/send] failed:", msg);
    return apiError("Failed to send the email. Check your SMTP settings.");
  }
}
