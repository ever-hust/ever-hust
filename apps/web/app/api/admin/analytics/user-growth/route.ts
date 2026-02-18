import { db } from "@repo/db";
import { sql } from "drizzle-orm";
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

    const result = await db.execute(sql`
      SELECT DATE(created_at) as date, COUNT(*)::int as count
      FROM users
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    const rows = result as unknown as Array<{ date: string; count: number }>;

    return apiSuccess(
      rows.map((row) => ({
        date: String(row.date),
        count: Number(row.count),
      }))
    );
  } catch (err) {
    console.error(
      "[api/admin/analytics/user-growth] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to fetch user growth data");
  }
}
