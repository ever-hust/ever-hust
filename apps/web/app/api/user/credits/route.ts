import { db, users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import {
  ensureMonthlyGrant,
  getCreditBalance,
  getCreditsSpentThisPeriod,
  getRecentCreditTransactions,
  creditsToUsd,
  PLAN_MONTHLY_CREDITS,
} from "@ever-hust/ai";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";

/** GET /api/user/credits — balance, monthly grant, recent ledger. */
export async function GET() {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = sessionUser.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const rows = await db
      .select({ subscriptionStatus: users.subscriptionStatus })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const status = rows[0]?.subscriptionStatus ?? "free";
    const isPaid = status === "active" || status === "past_due";

    // Make sure this month's free grant exists before reporting the balance.
    await ensureMonthlyGrant(userId, isPaid).catch(() => {});

    const [balance, spent, recent] = await Promise.all([
      getCreditBalance(userId),
      getCreditsSpentThisPeriod(userId),
      getRecentCreditTransactions(userId, 20),
    ]);

    return apiSuccess({
      plan: isPaid ? "pro" : "free",
      balance,
      balanceUsd: Number(creditsToUsd(balance).toFixed(2)),
      spentThisPeriod: spent,
      monthlyGrant: isPaid ? PLAN_MONTHLY_CREDITS.pro : PLAN_MONTHLY_CREDITS.free,
      enforced: process.env.CREDITS_ENFORCED === "true",
      recent: recent.map((t) => ({
        id: t.id,
        delta: t.delta,
        reason: t.reason,
        modelKey: t.modelKey,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    console.error("[api/user/credits] failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to load credits");
  }
}
