import { db } from "@ever-hust/db";
import { organizationMembers } from "@ever-hust/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "./get-session-user";

export type OrgRole = "owner" | "admin" | "member";

/**
 * Verify the current user is a member of the given organization.
 * Returns the session user and their org membership role.
 * Throws a NextResponse (401 or 403) on failure.
 */
export async function requireOrgMember(orgId: number) {
  const user = await requireSessionUser();

  const [membership] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, user.id)
      )
    )
    .limit(1);

  if (!membership) {
    throw NextResponse.json(
      { error: "You are not a member of this organization" },
      { status: 403 }
    );
  }

  const validRoles: OrgRole[] = ["owner", "admin", "member"];
  if (!validRoles.includes(membership.role as OrgRole)) {
    throw NextResponse.json(
      { error: "Invalid organization role" },
      { status: 403 }
    );
  }
  return { user, orgRole: membership.role as OrgRole };
}

/**
 * Verify the current user has one of the specified roles in the organization.
 * Returns the session user and their org membership role.
 * Throws a NextResponse (401 or 403) on failure.
 */
export async function requireOrgRole(orgId: number, ...roles: OrgRole[]) {
  const { user, orgRole } = await requireOrgMember(orgId);

  if (!roles.includes(orgRole)) {
    throw NextResponse.json(
      { error: "Insufficient organization permissions" },
      { status: 403 }
    );
  }

  return { user, orgRole };
}
