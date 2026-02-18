import { db } from "@repo/db";
import { organizations, organizationMembers } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../lib/get-session-user";
import { applyRateLimit } from "../../../lib/rate-limit";
import {
  createOrganizationSchema,
  parseBody,
} from "../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../lib/api-response";

/**
 * Generate a URL-friendly slug from a name.
 * Converts to lowercase, replaces non-alphanumeric chars with hyphens,
 * removes leading/trailing hyphens, and collapses multiple hyphens.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Ensure slug is unique by appending a numeric suffix if needed.
 */
async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 0;

  while (true) {
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!existing) return slug;

    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }
}

// GET /api/organizations - List organizations the current user belongs to
export async function GET() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const memberships = await db
      .select({
        organization: organizations,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt,
      })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizationMembers.organizationId, organizations.id)
      )
      .where(eq(organizationMembers.userId, user.id));

    return apiSuccess({ organizations: memberships });
  } catch (err) {
    console.error(
      "[api/organizations] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to load organizations");
  }
}

// POST /api/organizations - Create a new organization
export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(createOrganizationSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  try {
    const baseSlug = generateSlug(body.name);
    if (!baseSlug) {
      return apiBadRequest("Organization name must contain alphanumeric characters");
    }
    const slug = await ensureUniqueSlug(baseSlug);

    const [org] = await db
      .insert(organizations)
      .values({
        name: body.name,
        slug,
        logo: body.logo ?? null,
        website: body.website ?? null,
        createdById: user.id,
      })
      .returning();

    if (!org) {
      return apiError("Failed to create organization");
    }

    // Add the creator as an owner
    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: "owner",
    });

    return apiSuccess({ organization: org }, { status: 201 });
  } catch (err) {
    console.error(
      "[api/organizations] POST failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to create organization");
  }
}
