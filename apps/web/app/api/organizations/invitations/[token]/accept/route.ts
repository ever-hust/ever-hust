import { db } from "@repo/db";
import {
  organizationInvitations,
  organizationMembers,
  organizations,
} from "@repo/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiError,
} from "../../../../../../lib/api-response";

type RouteContext = { params: Promise<{ token: string }> };

// POST /api/organizations/invitations/[token]/accept - Accept an invitation
export async function POST(
  _req: Request,
  context: RouteContext
) {
  const { token } = await context.params;
  if (!token || token.length > 200) {
    return apiBadRequest("Invalid invitation token");
  }

  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    // Find the invitation
    const [invitation] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.token, token))
      .limit(1);

    if (!invitation) {
      return apiNotFound("Invitation not found");
    }

    // Check if invitation is still pending
    if (invitation.status !== "pending") {
      return apiBadRequest(`This invitation has already been ${invitation.status}`);
    }

    // Check expiration
    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      await db
        .update(organizationInvitations)
        .set({ status: "expired" })
        .where(eq(organizationInvitations.id, invitation.id));

      return apiBadRequest("This invitation has expired");
    }

    // Verify the invitation email matches the user's email
    if (user.email !== invitation.email) {
      return apiBadRequest(
        "This invitation was sent to a different email address"
      );
    }

    // Check if already a member
    const [existingMember] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, invitation.organizationId),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);

    if (existingMember) {
      // Mark invitation as accepted even if already a member
      await db
        .update(organizationInvitations)
        .set({ status: "accepted" })
        .where(eq(organizationInvitations.id, invitation.id));

      return apiBadRequest("You are already a member of this organization");
    }

    // Check member limit
    const [org] = await db
      .select({ maxMembers: organizations.maxMembers, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, invitation.organizationId))
      .limit(1);

    if (!org) {
      return apiError("Organization not found");
    }

    const currentMembers = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, invitation.organizationId));

    if (currentMembers.length >= org.maxMembers) {
      return apiBadRequest(
        "This organization has reached its member limit"
      );
    }

    // Create membership
    await db.insert(organizationMembers).values({
      organizationId: invitation.organizationId,
      userId: user.id,
      role: invitation.role,
    });

    // Mark invitation as accepted
    await db
      .update(organizationInvitations)
      .set({ status: "accepted" })
      .where(eq(organizationInvitations.id, invitation.id));

    return apiSuccess({
      message: `You have joined ${org.name}`,
      organizationId: invitation.organizationId,
    });
  } catch (err) {
    console.error(
      "[api/organizations/invitations/[token]/accept] POST failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to accept invitation");
  }
}
