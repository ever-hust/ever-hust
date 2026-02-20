import { db } from "@repo/db";
import { apiKeys } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { apiBadRequest, apiError, apiNotFound } from "../../../../../lib/api-response";

// DELETE /api/developer/keys/[keyId] - Revoke (soft-delete) an API key
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ keyId: string }> }
) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const { keyId } = await params;
  const keyIdNum = Number(keyId);

  if (isNaN(keyIdNum) || keyIdNum <= 0 || !Number.isInteger(keyIdNum)) {
    return apiBadRequest("Invalid API key ID");
  }

  try {
    // Soft delete: set isActive = false, only for keys owned by the user
    const result = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(
        and(eq(apiKeys.id, keyIdNum), eq(apiKeys.userId, user.id))
      )
      .returning();

    if (result.length === 0) {
      return apiNotFound("API key not found");
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(
      "[api/developer/keys/keyId] DELETE failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to revoke API key");
  }
}
