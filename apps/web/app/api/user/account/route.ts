import { db, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiError } from "../../../../lib/api-response";

/**
 * DELETE /api/user/account — Permanently delete the user account.
 * Cascading deletes handle related data (applications, chat sessions,
 * favorites, alerts) via foreign key constraints.
 * Also deletes the Stripe customer record for GDPR compliance.
 */
export async function DELETE() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit to prevent abuse
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    // Fetch Stripe customer ID before deleting the user record
    const [dbUser] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Delete the user — cascading FK constraints handle related records
    await db.delete(users).where(eq(users.id, userId));

    // Best-effort Stripe customer deletion (GDPR right to erasure)
    if (dbUser?.stripeCustomerId) {
      try {
        const { getStripe } = await import("@repo/stripe");
        await getStripe().customers.del(dbUser.stripeCustomerId);
      } catch (stripeErr) {
        // Log but don't fail the account deletion — DB record is already gone
        console.warn(
          "[api/user/account] Stripe customer cleanup failed:",
          stripeErr instanceof Error ? stripeErr.message : stripeErr,
        );
      }
    }

    // Clear the session cookie so the browser doesn't hold a stale token
    // after the user row (and cascaded session rows) are deleted.
    const response = new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    });
    response.headers.append(
      "Set-Cookie",
      "better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    );
    response.headers.append(
      "Set-Cookie",
      "__Secure-better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
    );
    return response;
  } catch (error) {
    console.error("[api/user/account] DELETE failed:", error instanceof Error ? error.message : error);
    return apiError("Failed to delete account");
  }
}
