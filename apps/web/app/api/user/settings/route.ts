import { db } from "@repo/db";
import { users } from "@repo/db";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { settingsPatchSchema, parseBody } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError, safeJsonParse } from "../../../../lib/api-response";

// PATCH /api/user/settings - Update user settings
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit: 100 req/min per authenticated user
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(settingsPatchSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  // Build allowed fields from validated body
  const allowedFields: Record<string, unknown> = {};

  if (body.name !== undefined) allowedFields.name = body.name;
  if (body.headline !== undefined) allowedFields.headline = body.headline;
  if (body.location !== undefined) allowedFields.location = body.location;

  try {
    // Handle preferences merge (deep merge with existing preferences)
    if (body.preferences) {
      const existing = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const existingPrefs =
        (existing[0]?.preferences as Record<string, unknown>) ?? {};
      allowedFields.preferences = {
        ...existingPrefs,
        ...body.preferences,
      };
    }

    if (Object.keys(allowedFields).length === 0) {
      return apiBadRequest("No valid fields to update");
    }

    await db
      .update(users)
      .set({ ...allowedFields, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return apiSuccess({ updated: true });
  } catch (err) {
    console.error("[api/user/settings] PATCH failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to update settings");
  }
}
