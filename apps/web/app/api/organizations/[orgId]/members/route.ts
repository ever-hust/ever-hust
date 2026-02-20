import { db } from "@repo/db";
import {
  organizationMembers,
  organizationInvitations,
  organizations,
  users,
} from "@repo/db/schema";
import { eq, and, count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgMember, requireOrgRole } from "../../../../../lib/auth-org";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { inviteMemberSchema, parseBody } from "../../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../../lib/api-response";

type RouteContext = { params: Promise<{ orgId: string }> };

// GET /api/organizations/[orgId]/members - List org members
export async function GET(
  _req: Request,
  context: RouteContext
) {
  const { orgId: orgIdStr } = await context.params;
  const orgId = Number(orgIdStr);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return apiBadRequest("Invalid organization ID");
  }

  let memberInfo;
  try {
    memberInfo = await requireOrgMember(orgId);
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(memberInfo.user.id, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const members = await db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, orgId))
      .limit(200);

    // Also fetch pending invitations if user is owner/admin
    let invitations: Array<{
      id: number;
      email: string;
      role: string;
      status: string;
      expiresAt: Date;
      createdAt: Date;
    }> = [];

    if (memberInfo.orgRole === "owner" || memberInfo.orgRole === "admin") {
      invitations = await db
        .select({
          id: organizationInvitations.id,
          email: organizationInvitations.email,
          role: organizationInvitations.role,
          status: organizationInvitations.status,
          expiresAt: organizationInvitations.expiresAt,
          createdAt: organizationInvitations.createdAt,
        })
        .from(organizationInvitations)
        .where(
          and(
            eq(organizationInvitations.organizationId, orgId),
            eq(organizationInvitations.status, "pending")
          )
        )
        .limit(200);
    }

    return apiSuccess({ members, invitations });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]/members] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to load members");
  }
}

// POST /api/organizations/[orgId]/members - Invite a new member
export async function POST(
  req: Request,
  context: RouteContext
) {
  const { orgId: orgIdStr } = await context.params;
  const orgId = Number(orgIdStr);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return apiBadRequest("Invalid organization ID");
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
  const validation = parseBody(inviteMemberSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  try {
    // Check org member limit
    const [org] = await db
      .select({ maxMembers: organizations.maxMembers })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      return apiBadRequest("Organization not found");
    }

    const [memberCount] = await db
      .select({ value: count() })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

    if ((memberCount?.value ?? 0) >= org.maxMembers) {
      return apiBadRequest(
        `Organization has reached its member limit of ${org.maxMembers}`
      );
    }

    // Check if user is already a member (by email)
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    if (existingUser) {
      const [existingMember] = await db
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, existingUser.id)
          )
        )
        .limit(1);

      if (existingMember) {
        return apiBadRequest("This user is already a member of the organization");
      }
    }

    // Check for existing pending invitation
    const [existingInvitation] = await db
      .select({ id: organizationInvitations.id })
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.organizationId, orgId),
          eq(organizationInvitations.email, body.email),
          eq(organizationInvitations.status, "pending")
        )
      )
      .limit(1);

    if (existingInvitation) {
      return apiBadRequest("An invitation is already pending for this email");
    }

    // Generate a secure token
    const token = crypto.randomUUID();

    // Create invitation (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [invitation] = await db
      .insert(organizationInvitations)
      .values({
        organizationId: orgId,
        email: body.email,
        role: body.role,
        token,
        invitedById: memberInfo.user.id,
        expiresAt,
      })
      .returning();

    if (!invitation) {
      return apiError("Failed to create invitation");
    }

    return apiSuccess({ invitation }, { status: 201 });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]/members] POST failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to create invitation");
  }
}
