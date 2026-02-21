import { db } from "@ever-hust/db";
import { organizationAiConfigs } from "@ever-hust/db/schema";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireOrgMember, requireOrgRole } from "../../../../../lib/auth-org";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { orgAiConfigSchema, parseBody } from "../../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../../lib/api-response";

type RouteContext = { params: Promise<{ orgId: string }> };

// GET /api/organizations/[orgId]/ai-config
export async function GET(_req: Request, context: RouteContext) {
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
    const [config] = await db
      .select({
        id: organizationAiConfigs.id,
        organizationId: organizationAiConfigs.organizationId,
        preferredModel: organizationAiConfigs.preferredModel,
        customSystemPrompt: organizationAiConfigs.customSystemPrompt,
        maxTokens: organizationAiConfigs.maxTokens,
        temperature: organizationAiConfigs.temperature,
        enabledTools: organizationAiConfigs.enabledTools,
        isActive: organizationAiConfigs.isActive,
        createdAt: organizationAiConfigs.createdAt,
        updatedAt: organizationAiConfigs.updatedAt,
      })
      .from(organizationAiConfigs)
      .where(eq(organizationAiConfigs.organizationId, orgId))
      .limit(1);

    return apiSuccess({ config: config ?? null });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]/ai-config] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to load AI configuration");
  }
}

// PUT /api/organizations/[orgId]/ai-config
export async function PUT(req: Request, context: RouteContext) {
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

  const rateLimitedPut = applyRateLimit(memberInfo.user.id, "authenticated");
  if (rateLimitedPut) return rateLimitedPut;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;

  const validation = parseBody(orgAiConfigSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }

  const body = validation.data;

  try {
    // Check if config already exists
    const [existing] = await db
      .select({ id: organizationAiConfigs.id })
      .from(organizationAiConfigs)
      .where(eq(organizationAiConfigs.organizationId, orgId))
      .limit(1);

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.preferredModel !== undefined) {
      updates.preferredModel = body.preferredModel || null;
    }
    if (body.customSystemPrompt !== undefined) {
      updates.customSystemPrompt = body.customSystemPrompt || null;
    }
    if (body.maxTokens !== undefined) {
      updates.maxTokens = body.maxTokens ?? null;
    }
    if (body.temperature !== undefined) {
      updates.temperature = body.temperature ?? null;
    }
    if (body.enabledTools !== undefined) {
      updates.enabledTools = body.enabledTools ?? null;
    }

    let config;
    if (existing) {
      const [updated] = await db
        .update(organizationAiConfigs)
        .set(updates)
        .where(eq(organizationAiConfigs.id, existing.id))
        .returning();
      config = updated;
    } else {
      const [created] = await db
        .insert(organizationAiConfigs)
        .values({
          organizationId: orgId,
          preferredModel: (body.preferredModel as string) || null,
          customSystemPrompt: (body.customSystemPrompt as string) || null,
          maxTokens: body.maxTokens ?? null,
          temperature: body.temperature ?? null,
          enabledTools: body.enabledTools ?? null,
        })
        .returning();
      config = created;
    }

    if (!config) {
      return apiError("Failed to save AI configuration");
    }

    return apiSuccess({ config });
  } catch (err) {
    console.error(
      "[api/organizations/[orgId]/ai-config] PUT failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to update AI configuration");
  }
}
