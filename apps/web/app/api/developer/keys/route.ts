import { db } from "@repo/db";
import { apiKeys } from "@repo/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { createApiKeySchema, parseBody } from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../lib/api-response";

// GET /api/developer/keys - List user's API keys
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
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        rateLimit: apiKeys.rateLimit,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, user.id))
      .orderBy(apiKeys.createdAt);

    return apiSuccess({ keys });
  } catch (err) {
    console.error(
      "[api/developer/keys] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to load API keys");
  }
}

// POST /api/developer/keys - Create a new API key
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
  const validation = parseBody(createApiKeySchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  try {
    // Generate a random API key: ej_live_ + 32 random hex chars
    const rawKey = `ej_live_${randomBytes(16).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.substring(0, 16); // "ej_live_" + first 8 hex chars

    const [created] = await db
      .insert(apiKeys)
      .values({
        userId: user.id,
        name: body.name,
        keyHash,
        keyPrefix,
        scopes: body.scopes,
        rateLimit: body.rateLimit,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
      });

    // Return the full key ONCE — user must save it
    return apiSuccess(
      {
        key: rawKey,
        id: created!.id,
        name: created!.name,
        keyPrefix: created!.keyPrefix,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(
      "[api/developer/keys] POST failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to create API key");
  }
}
