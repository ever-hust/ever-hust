import { db, organizationMembers, organizations, users } from "@ever-hust/db";
import { deleteUserFiles } from "@ever-hust/supabase/storage";
import { and, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiError } from "../../../../lib/api-response";

type OrgRole = "owner" | "admin" | "member";

const ROLE_RANK: Record<OrgRole, number> = { owner: 0, admin: 1, member: 2 };

type OtherMember = {
  organizationId: number;
  userId: string;
  role: OrgRole;
  joinedAt: Date;
};

/**
 * Who takes over an organization's created_by_id: an owner first, then an
 * admin, then a member, the longest-standing first within each role.
 */
function pickSuccessor(members: OtherMember[]): OtherMember | undefined {
  return [...members].sort(
    (a, b) =>
      ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
      a.joinedAt.getTime() - b.joinedAt.getTime(),
  )[0];
}

/**
 * DELETE /api/user/account — Permanently delete the user account.
 * Cascading deletes handle related data (applications, chat sessions,
 * favorites, alerts) via foreign key constraints.
 * Organizations the user created are handed to another member first, and the
 * delete is refused with 409 while the user is the last owner of an
 * organization other members still use.
 * Also deletes the Stripe customer record and the user's CVs and avatar in
 * Storage for GDPR compliance.
 */
export async function DELETE() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit to prevent abuse
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    // Fetch Stripe customer ID before deleting the user record
    const [dbUser] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // organizations.created_by_id is ON DELETE CASCADE, so deleting the user
    // would also delete every organization they created, with its members,
    // invitations, AI config and branding. In one transaction: refuse while the
    // user is the last owner of an organization other members still use, hand
    // created_by_id of each organization they created to another member, then
    // delete the user. An organization nobody else uses still goes with them.
    const blockedOrgIds = await db.transaction(async (tx) => {
      // Lock every organization the user is a member of or created, in id
      // order so two deletes that share organizations can't deadlock. Another
      // member deleting their account at the same moment holds these rows
      // until it commits, and the reads below run after that, so they see its
      // hand-over of created_by_id and its deleted memberships. Without the
      // lock two co-owners each still saw the other as an owner, and the
      // second user delete cascaded to the organization the first had just
      // handed to them.
      const memberOf = await tx
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, userId));
      const createdBeforeLock = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.createdById, userId));
      const lockIds = [
        ...new Set([
          ...memberOf.map((m) => m.organizationId),
          ...createdBeforeLock.map((o) => o.id),
        ]),
      ];
      if (lockIds.length > 0) {
        await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(inArray(organizations.id, lockIds))
          .orderBy(organizations.id)
          .for("update");
      }

      const owned = await tx
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.role, "owner"),
          ),
        );
      const created = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.createdById, userId));

      const orgIds = [
        ...new Set([
          ...owned.map((m) => m.organizationId),
          ...created.map((o) => o.id),
        ]),
      ];
      const others: OtherMember[] =
        orgIds.length === 0
          ? []
          : await tx
              .select({
                organizationId: organizationMembers.organizationId,
                userId: organizationMembers.userId,
                role: organizationMembers.role,
                joinedAt: organizationMembers.joinedAt,
              })
              .from(organizationMembers)
              .where(
                and(
                  inArray(organizationMembers.organizationId, orgIds),
                  ne(organizationMembers.userId, userId),
                ),
              );
      const othersIn = (orgId: number) =>
        others.filter((m) => m.organizationId === orgId);

      // Same rule as removing a member: the last owner can't leave while
      // others still use the organization.
      const blocked = owned
        .map((m) => m.organizationId)
        .filter((orgId) => {
          const rest = othersIn(orgId);
          return rest.length > 0 && !rest.some((m) => m.role === "owner");
        });
      if (blocked.length > 0) return blocked;

      for (const org of created) {
        const successor = pickSuccessor(othersIn(org.id));
        if (!successor) continue;
        await tx
          .update(organizations)
          .set({ createdById: successor.userId, updatedAt: new Date() })
          .where(eq(organizations.id, org.id));
      }

      // Delete the user — cascading FK constraints handle related records
      await tx.delete(users).where(eq(users.id, userId));
      return [];
    });

    if (blockedOrgIds.length > 0) {
      return apiError(
        "You are the last owner of an organization that other members still use. Transfer ownership first.",
        409,
        { organizationIds: blockedOrgIds },
      );
    }

    // Best-effort Stripe customer deletion (GDPR right to erasure)
    if (dbUser?.stripeCustomerId) {
      try {
        const { getStripe } = await import("@ever-hust/stripe");
        await getStripe().customers.del(dbUser.stripeCustomerId);
      } catch (stripeErr) {
        // Log but don't fail the account deletion — DB record is already gone
        console.warn(
          "[api/user/account] Stripe customer cleanup failed:",
          stripeErr instanceof Error ? stripeErr.message : stripeErr,
        );
      }
    }

    // Best-effort removal of the user's CVs and avatar from Storage (GDPR right
    // to erasure): their public URLs keep working until the files are gone.
    // deleteUserFiles logs its failures and never throws.
    await deleteUserFiles(userId);

    // Clear the session cookie so the browser doesn't hold a stale token
    // after the user row (and cascaded session rows) are deleted.
    const response = new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    });
    response.headers.append(
      "Set-Cookie",
      "better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    );
    response.headers.append(
      "Set-Cookie",
      "__Secure-better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
    );
    return response;
  } catch (error) {
    console.error("[api/user/account] DELETE failed:", error instanceof Error ? error.message : error);
    return apiError("Failed to delete account");
  }
}
