import { db } from "@repo/db";
import { brandingConfigs } from "@repo/db/schema";
import { eq, isNull } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { brandingConfigSchema, parseBody } from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../lib/api-response";

/**
 * GET /api/admin/branding
 * Returns the platform default branding config (where organizationId IS NULL).
 */
export async function GET() {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "admin");
  if (rateLimited) return rateLimited;

  try {
    const [config] = await db
      .select()
      .from(brandingConfigs)
      .where(isNull(brandingConfigs.organizationId))
      .limit(1);

    return apiSuccess({ config: config ?? null });
  } catch (err) {
    console.error(
      "[api/admin/branding] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to fetch branding config");
  }
}

/**
 * POST /api/admin/branding
 * Creates or updates the platform default branding config.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "adminWrite");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = parseBody(brandingConfigSchema, jsonResult.data);
  if (!parsed.success) return apiBadRequest(parsed.error);

  const body = parsed.data;

  try {
    // Check-and-upsert in a transaction to prevent duplicate platform defaults
    // from concurrent POST requests.
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: brandingConfigs.id })
        .from(brandingConfigs)
        .where(isNull(brandingConfigs.organizationId))
        .limit(1);

      const values = {
        name: body.name,
        logoUrl: body.logoUrl ?? null,
        faviconUrl: body.faviconUrl ?? null,
        primaryColor: body.primaryColor ?? null,
        accentColor: body.accentColor ?? null,
        tagline: body.tagline ?? null,
        customFooterHtml: body.customFooterHtml ?? null,
        hideEverJobsBranding: body.hideEverJobsBranding ?? false,
        customDomain: body.customDomain ?? null,
      };

      if (existing) {
        const [updated] = await tx
          .update(brandingConfigs)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(brandingConfigs.id, existing.id))
          .returning();
        return { config: updated, created: false } as const;
      }

      const [created] = await tx
        .insert(brandingConfigs)
        .values({ ...values, organizationId: null })
        .returning();
      return { config: created, created: true } as const;
    });

    if (!result.config) {
      return apiError("Failed to save branding config");
    }

    return apiSuccess(
      { config: result.config },
      result.created ? { status: 201 } : undefined,
    );
  } catch (err) {
    console.error(
      "[api/admin/branding] POST failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to save branding config");
  }
}
