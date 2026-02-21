import { db } from "@ever-hust/db";
import { users } from "@ever-hust/db/schema";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../../../lib/rate-limit";
import { updateUserRoleSchema, parseBody } from "../../../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiError,
  safeJsonParse,
} from "../../../../../../lib/api-response";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "adminWrite");
  if (rateLimited) return rateLimited;

  const { userId } = await params;

  if (!userId || typeof userId !== "string" || userId.length > 100) {
    return apiBadRequest("Invalid user ID");
  }

  // Prevent admins from demoting themselves
  if (userId === admin.id) {
    return apiBadRequest("You cannot change your own role");
  }

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;

  const validation = parseBody(updateUserRoleSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }

  const { role } = validation.data;

  try {
    // Check that the target user exists
    const [targetUser] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser) {
      return apiNotFound("User not found");
    }

    // Update the role
    await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return apiSuccess({
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role,
    });
  } catch (err) {
    console.error(
      "[api/admin/users/role] PATCH failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to update user role");
  }
}
