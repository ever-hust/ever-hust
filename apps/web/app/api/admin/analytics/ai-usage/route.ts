import { db } from "@repo/db";
import { chatSessions, chatMessages } from "@repo/db/schema";
import { count, gte, sql } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../../lib/api-response";
import { analyticsDateRangeSchema } from "../../../../../lib/api-schemas";

export async function GET(request: NextRequest) {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "adminWrite");
  if (rateLimited) return rateLimited;

  try {
    const searchParams = request.nextUrl.searchParams;
    const parsed = analyticsDateRangeSchema.safeParse({
      days: searchParams.get("days") ?? undefined,
    });

    const days = parsed.success ? parsed.data.days : 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [
      totalSessionsResult,
      totalMessagesResult,
      dailyMessagesResult,
      statusBreakdownResult,
    ] = await Promise.all([
      // Total chat sessions in the period
      db
        .select({ value: count() })
        .from(chatSessions)
        .where(gte(chatSessions.createdAt, startDate)),

      // Total messages in the period
      db
        .select({ value: count() })
        .from(chatMessages)
        .where(gte(chatMessages.createdAt, startDate)),

      // Daily message counts
      db.execute(sql`
        SELECT DATE(created_at) as date, COUNT(*)::int as count
        FROM chat_messages
        WHERE created_at >= ${startDate}
        GROUP BY DATE(created_at)
        ORDER BY date
      `),

      // Chat session status breakdown
      db
        .select({
          status: chatSessions.status,
          value: count(),
        })
        .from(chatSessions)
        .where(gte(chatSessions.createdAt, startDate))
        .groupBy(chatSessions.status),
    ]);

    const dailyMessageCounts = (
      dailyMessagesResult as unknown as Array<{
        date: string;
        count: number;
      }>
    ).map((r) => ({ date: String(r.date), count: Number(r.count) }));

    const chatSessionStatusBreakdown = statusBreakdownResult.map((r) => ({
      status: r.status,
      count: r.value,
    }));

    return apiSuccess({
      totalChatSessions: totalSessionsResult[0]?.value ?? 0,
      totalMessages: totalMessagesResult[0]?.value ?? 0,
      dailyMessageCounts,
      chatSessionStatusBreakdown,
    });
  } catch (err) {
    console.error(
      "[api/admin/analytics/ai-usage] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to fetch AI usage data");
  }
}
