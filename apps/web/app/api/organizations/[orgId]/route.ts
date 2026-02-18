import { db } from "@repo/db";
import { organizations, organizationMembers } from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgMember, requireOrgRole } from "../../../../lib/auth-org";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  updateOrganizationSchema,
  parseBody,
} from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiError,
  safeJsonParse,
} from "../../../../lib/api-response";

type RouteContext = { params: Promise<{ orgId: string }> };

// GET /api/organizations/[orgId] - Get organization details
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
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      return apiNotFound("Organization not found");
    }

    // Get member count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

    return apiSuccess({
      organization: org,
      memberCount: countResult?.count ?? 0,
      currentUserRole: memberInfo.orgRole,
    });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to load organization");
  }
}

// PATCH /api/organizations/[orgId] - Update organization details
export async function PATCH(
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
  const validation = parseBody(updateOrganizationSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  // Build update fields
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.logo !== undefined) updates.logo = body.logo;
  if (body.website !== undefined) updates.website = body.website;

  try {
    const result = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId))
      .returning();

    if (result.length === 0) {
      return apiNotFound("Organization not found");
    }

    return apiSuccess({ organization: result[0] });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]] PATCH failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to update organization");
  }
}
