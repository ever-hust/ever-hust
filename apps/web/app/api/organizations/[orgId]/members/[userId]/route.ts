import { db } from "@repo/db";
import { organizationMembers } from "@repo/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgRole } from "../../../../../../lib/auth-org";
import { applyRateLimit } from "../../../../../../lib/rate-limit";
import {
  updateMemberRoleSchema,
  parseBody,
} from "../../../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiError,
  safeJsonParse,
} from "../../../../../../lib/api-response";

type RouteContext = { params: Promise<{ orgId: string; userId: string }> };

// PATCH /api/organizations/[orgId]/members/[userId] - Update member role
export async function PATCH(
  req: Request,
  context: RouteContext
) {
  const { orgId: orgIdStr, userId: targetUserId } = await context.params;
  const orgId = Number(orgIdStr);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return apiBadRequest("Invalid organization ID");
  }
  if (!targetUserId || typeof targetUserId !== "string" || targetUserId.length > 100) {
    return apiBadRequest("Invalid user ID");
  }

  let memberInfo;
  try {
    memberInfo = await requireOrgRole(orgId, "owner", "admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(memberInfo.user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(updateMemberRoleSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const { role: newRole } = validation.data;

  try {
    // Get the target member
    const [targetMember] = await db
      .select({
        id: organizationMembers.id,
        role: organizationMembers.role,
        userId: organizationMembers.userId,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!targetMember) {
      return apiNotFound("Member not found");
    }

    // Only owners can change roles to/from owner or admin
    if (
      (targetMember.role === "owner" || newRole === "owner") &&
      memberInfo.orgRole !== "owner"
    ) {
      return apiBadRequest("Only owners can transfer or modify owner roles");
    }
    if (
      (targetMember.role === "admin" || newRole === "admin") &&
      memberInfo.orgRole !== "owner"
    ) {
      return apiBadRequest("Only owners can promote or demote admins");
    }

    // If demoting an owner, ensure at least one owner remains
    if (targetMember.role === "owner" && newRole !== "owner") {
      const owners = await db
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.role, "owner")
          )
        );

      if (owners.length <= 1) {
        return apiBadRequest(
          "Cannot change the last owner's role. Transfer ownership first."
        );
      }
    }

    const [updated] = await db
      .update(organizationMembers)
      .set({ role: newRole })
      .where(eq(organizationMembers.id, targetMember.id))
      .returning();

    if (!updated) {
      return apiError("Failed to update member role");
    }

    return apiSuccess({ member: updated });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]/members/[userId]] PATCH failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to update member role");
  }
}

// DELETE /api/organizations/[orgId]/members/[userId] - Remove a member
export async function DELETE(
  _req: Request,
  context: RouteContext
) {
  const { orgId: orgIdStr, userId: targetUserId } = await context.params;
  const orgId = Number(orgIdStr);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return apiBadRequest("Invalid organization ID");
  }
  if (!targetUserId || typeof targetUserId !== "string" || targetUserId.length > 100) {
    return apiBadRequest("Invalid user ID");
  }

  let memberInfo;
  try {
    memberInfo = await requireOrgRole(orgId, "owner", "admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(memberInfo.user.id, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    // Get the target member
    const [targetMember] = await db
      .select({
        id: organizationMembers.id,
        role: organizationMembers.role,
        userId: organizationMembers.userId,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!targetMember) {
      return apiNotFound("Member not found");
    }

    // Cannot remove an owner unless you're an owner
    if (targetMember.role === "owner" && memberInfo.orgRole !== "owner") {
      return apiBadRequest("Only owners can remove other owners");
    }

    // Prevent removing the last owner
    if (targetMember.role === "owner") {
      const owners = await db
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.role, "owner")
          )
        );

      if (owners.length <= 1) {
        return apiBadRequest(
          "Cannot remove the last owner. Transfer ownership first."
        );
      }
    }

    // Admins cannot remove other admins or owners
    if (
      memberInfo.orgRole === "admin" &&
      (targetMember.role === "admin" || targetMember.role === "owner") &&
      targetMember.userId !== memberInfo.user.id
    ) {
      return apiBadRequest("Admins cannot remove other admins or owners");
    }

    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, targetMember.id));

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]/members/[userId]] DELETE failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to remove member");
  }
}
