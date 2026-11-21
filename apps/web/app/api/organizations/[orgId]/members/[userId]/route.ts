import { db } from "@ever-hust/db";
import { organizationMembers, organizations } from "@ever-hust/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgRole, type OrgRole } from "../../../../../../lib/auth-org";
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
  apiForbidden,
  safeJsonParse,
} from "../../../../../../lib/api-response";

type RouteContext = { params: Promise<{ orgId: string; userId: string }> };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Member = { id: number; role: OrgRole; userId: string };

/**
 * Locks the organization row (SELECT ... FOR UPDATE), then reads the caller's
 * role and the target member again under that lock.
 *
 * DELETE /api/user/account takes the same row lock, in id order, before its
 * last-owner check, and so does the guest-to-account move. Two owners who
 * demote or remove each other, or one who leaves while the other deletes their
 * account, then run one after the other: the second sees the first's change
 * and is refused as the last owner, instead of both passing their owner check
 * on the same snapshot and leaving the organization with no owner. The
 * caller's role is re-read because it may have changed since requireOrgRole.
 */
async function lockMembers(
  tx: Tx,
  orgId: number,
  actorUserId: string,
  targetUserId: string,
): Promise<
  | { response: NextResponse }
  | { actorRole: OrgRole; target: Member }
> {
  const [org] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .for("update");
  if (!org) return { response: apiNotFound("Organization not found") };

  const [actor] = await tx
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, actorUserId)
      )
    )
    .limit(1);
  if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
    return { response: apiForbidden("Insufficient organization permissions") };
  }

  const [target] = await tx
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
  if (!target) return { response: apiNotFound("Member not found") };

  return { actorRole: actor.role, target };
}

/** Number of owners, read inside the transaction that holds the organization lock. */
async function countOwners(tx: Tx, orgId: number): Promise<number> {
  const owners = await tx
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.role, "owner")
      )
    );
  return owners.length;
}

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

  const actorUserId = memberInfo.user.id;
  try {
    return await db.transaction(async (tx) => {
      const locked = await lockMembers(tx, orgId, actorUserId, targetUserId);
      if ("response" in locked) return locked.response;
      const { actorRole, target: targetMember } = locked;

      // Only owners can change roles to/from owner or admin
      if (
        (targetMember.role === "owner" || newRole === "owner") &&
        actorRole !== "owner"
      ) {
        return apiBadRequest("Only owners can transfer or modify owner roles");
      }
      if (
        (targetMember.role === "admin" || newRole === "admin") &&
        actorRole !== "owner"
      ) {
        return apiBadRequest("Only owners can promote or demote admins");
      }

      // If demoting an owner, ensure at least one owner remains
      if (
        targetMember.role === "owner" &&
        newRole !== "owner" &&
        (await countOwners(tx, orgId)) <= 1
      ) {
        return apiBadRequest(
          "Cannot change the last owner's role. Transfer ownership first."
        );
      }

      const [updated] = await tx
        .update(organizationMembers)
        .set({ role: newRole })
        .where(eq(organizationMembers.id, targetMember.id))
        .returning();

      if (!updated) {
        return apiError("Failed to update member role");
      }

      return apiSuccess({ member: updated });
    });
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

  const actorUserId = memberInfo.user.id;
  try {
    return await db.transaction(async (tx) => {
      const locked = await lockMembers(tx, orgId, actorUserId, targetUserId);
      if ("response" in locked) return locked.response;
      const { actorRole, target: targetMember } = locked;

      // Cannot remove an owner unless you're an owner
      if (targetMember.role === "owner" && actorRole !== "owner") {
        return apiBadRequest("Only owners can remove other owners");
      }

      // Prevent removing the last owner
      if (targetMember.role === "owner" && (await countOwners(tx, orgId)) <= 1) {
        return apiBadRequest(
          "Cannot remove the last owner. Transfer ownership first."
        );
      }

      // Admins cannot remove other admins or owners
      if (
        actorRole === "admin" &&
        (targetMember.role === "admin" || targetMember.role === "owner") &&
        targetMember.userId !== actorUserId
      ) {
        return apiBadRequest("Admins cannot remove other admins or owners");
      }

      await tx
        .delete(organizationMembers)
        .where(eq(organizationMembers.id, targetMember.id));

      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
      });
    });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]/members/[userId]] DELETE failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to remove member");
  }
}
