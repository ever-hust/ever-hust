import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";
import { loadAccount } from "../../../../lib/inbox";
import { syncAccount } from "../../../../lib/inbox-sync";

export const maxDuration = 60;

/** POST — pull recent INBOX messages over IMAP and store them (on demand). */
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

  const result = await syncAccount(user.id, account);
  if (result.error && result.fetched === 0 && result.stored === 0) {
    if (result.error === "encryption not configured") {
      return apiError("Email encryption is not configured on the server.", 500);
    }
    return apiError("Failed to sync your mailbox. Check your connection settings.");
  }
  return apiSuccess({ fetched: result.fetched, stored: result.stored });
}
