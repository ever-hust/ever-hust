import { db } from "@repo/db";
import { users } from "@repo/db/schema";
import { count, desc, ilike, or } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth-roles";
import { adminUsersQuerySchema } from "../../../../lib/api-schemas";
import { apiSuccess, apiBadRequest, apiError } from "../../../../lib/api-response";

export async function GET(req: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  try {
    const url = new URL(req.url);
    const rawParams = {
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    };

    const validation = adminUsersQuerySchema.safeParse(rawParams);
    if (!validation.success) {
      const messages = validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return apiBadRequest(messages);
    }

    const { page, limit, search } = validation.data;
    const offset = (page - 1) * limit;

    // Build search condition
    const searchCondition = search
      ? or(
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`),
        )
      : undefined;

    // Run count and data queries in parallel
    const [totalResult, userList] = await Promise.all([
      db
        .select({ value: count() })
        .from(users)
        .where(searchCondition),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
          role: users.role,
          subscriptionStatus: users.subscriptionStatus,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(searchCondition)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalResult[0]?.value ?? 0;
    const totalPages = Math.ceil(total / limit);

    return apiSuccess({
      users: userList,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    console.error(
      "[api/admin/users] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to fetch users");
  }
}
