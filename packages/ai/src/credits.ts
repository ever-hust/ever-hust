import { db, creditTransactions } from "@ever-hust/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { findModelByKey } from "@ever-hust/plugin";

/**
 * Credit metering. Credits are integers where **1000 credits = $1**. Usage of a
 * platform (Hust) model debits credits priced from the model's API cost; each
 * tier gets a monthly free grant; top-ups add credits. BYOK calls (user's own
 * key) are not metered — the user pays their provider directly.
 */
export const CREDITS_PER_USD = 1000;

/** Reasonable monthly free-credit grants per tier (tunable). */
export const PLAN_MONTHLY_CREDITS = {
  free: 1000, // ~$1 of platform model usage / month
  pro: 30000, // ~$30 / month (generous vs the $20 plan)
} as const;

/** Credit packs available for top-up (id → credits). $ = credits / 1000. */
export const CREDIT_PACKS = {
  small: 5000, // $5
  medium: 12000, // $12 (20% bonus)
  large: 30000, // $30 (25% bonus)
} as const;
export type CreditPackId = keyof typeof CREDIT_PACKS;

/** Approx. provider price in USD per 1M tokens [input, output]. Tunable. */
const MODEL_COSTS: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4.6": { in: 3, out: 15 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4.5": { in: 0.8, out: 4 },
  "claude-haiku-4-5": { in: 0.8, out: 4 },
  "claude-opus-4.8": { in: 15, out: 75 },
  "claude-opus-4-8": { in: 15, out: 75 },
  "gpt-5.5-pro": { in: 15, out: 60 },
  "gpt-5.5": { in: 5, out: 15 },
  "gemini-3.1-pro": { in: 2, out: 10 },
  "gemini-3.5-flash": { in: 0.3, out: 1.2 },
};
const DEFAULT_COST = { in: 3, out: 15 };

function priceForModelKey(modelKey?: string): { in: number; out: number } {
  if (!modelKey) return DEFAULT_COST;
  const id = (findModelByKey(modelKey)?.modelId ?? modelKey).toLowerCase();
  // Longest key first so "gpt-5.5-pro" beats "gpt-5.5".
  const keys = Object.keys(MODEL_COSTS).sort((a, b) => b.length - a.length);
  for (const k of keys) if (id.includes(k)) return MODEL_COSTS[k]!;
  return DEFAULT_COST;
}

/** Cost of a single call in credits (min 1 when any tokens were used). */
export function costInCredits(
  modelKey: string | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = priceForModelKey(modelKey);
  const usd = (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
  const credits = Math.round(usd * CREDITS_PER_USD);
  return inputTokens + outputTokens > 0 ? Math.max(1, credits) : 0;
}

export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
}

/** Current YYYY-MM period key (for monthly-grant idempotency). */
export function currentPeriodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getCreditBalance(userId: string): Promise<number> {
  const rows = await db
    .select({ bal: sql<number>`coalesce(sum(${creditTransactions.delta}), 0)` })
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId));
  return Number(rows[0]?.bal ?? 0);
}

/** Debit credits for a metered platform model call. Returns credits charged. */
export async function recordChatUsage(args: {
  userId: string;
  modelKey?: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<number> {
  const credits = costInCredits(args.modelKey, args.inputTokens, args.outputTokens);
  if (credits <= 0) return 0;
  await db.insert(creditTransactions).values({
    userId: args.userId,
    delta: -credits,
    reason: "usage",
    modelKey: args.modelKey ?? null,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costMicroUsd: Math.round(creditsToUsd(credits) * 1e6),
  });
  return credits;
}

/** Idempotently grant a tier's monthly credits (once per user per month). */
export async function ensureMonthlyGrant(
  userId: string,
  isPaid: boolean,
  periodKey = currentPeriodKey(),
): Promise<void> {
  const amount = isPaid ? PLAN_MONTHLY_CREDITS.pro : PLAN_MONTHLY_CREDITS.free;
  await db
    .insert(creditTransactions)
    .values({ userId, delta: amount, reason: "grant_monthly", periodKey })
    .onConflictDoNothing();
}

/** Add credits (top-up purchase / manual adjustment). */
export async function grantCredits(
  userId: string,
  amount: number,
  reason: "topup" | "adjustment" | "grant_signup" = "topup",
): Promise<void> {
  if (amount <= 0) return;
  await db.insert(creditTransactions).values({ userId, delta: amount, reason });
}

export async function getRecentCreditTransactions(userId: string, limit = 20) {
  return db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit);
}

/** Total credits spent (usage) in the current period, for display. */
export async function getCreditsSpentThisPeriod(userId: string): Promise<number> {
  const start = `${currentPeriodKey()}-01`;
  const rows = await db
    .select({ spent: sql<number>`coalesce(sum(-${creditTransactions.delta}), 0)` })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.reason, "usage"),
        sql`${creditTransactions.createdAt} >= ${start}`,
      ),
    );
  return Number(rows[0]?.spent ?? 0);
}
