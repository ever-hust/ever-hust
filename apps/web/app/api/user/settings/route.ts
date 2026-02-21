import { db } from "@ever-hust/db";
import { users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { settingsPatchSchema, parseBody } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError, safeJsonParse } from "../../../../lib/api-response";
import { encryptApiKey } from "@ever-hust/ai/crypto";

// PATCH /api/user/settings - Update user settings
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit: 100 req/min per authenticated user
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(settingsPatchSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  // Build allowed fields from validated body
  const allowedFields: Record<string, unknown> = {};

  if (body.name !== undefined) allowedFields.name = body.name;
  if (body.headline !== undefined) allowedFields.headline = body.headline;
  if (body.location !== undefined) allowedFields.location = body.location;

  try {
    // Handle preferences merge (deep merge with existing preferences)
    if (body.preferences) {
      const prefs = body.preferences;
      // Use transaction to prevent concurrent preference updates from overwriting each other
      const mergedPrefs = await db.transaction(async (tx) => {
        const existing = await tx
          .select({ preferences: users.preferences })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        const existingPrefs =
          (existing[0]?.preferences as Record<string, unknown>) ?? {};

        // Deep-merge apiKeys to prevent erasing sibling keys when only one key is updated
        // e.g. sending { apiKeys: { anthropic: "sk-new" } } should NOT erase openai/google keys
        const merged = { ...existingPrefs, ...prefs };
        if (prefs.apiKeys !== undefined) {
          const existingApiKeys =
            (existingPrefs.apiKeys as Record<string, unknown>) ?? {};
          const incomingKeys = prefs.apiKeys as Record<string, string>;

          // Encrypt non-empty API keys before storing
          const encryptedKeys: Record<string, string> = {};
          for (const [provider, key] of Object.entries(incomingKeys)) {
            if (key && key.trim()) {
              try {
                encryptedKeys[provider] = encryptApiKey(key);
              } catch (encErr) {
                console.error(
                  "[api/user/settings] Failed to encrypt API key:",
                  encErr instanceof Error ? encErr.message : encErr
                );
                // Throw to roll back the transaction — the outer catch handles this.
                // Previously this returned apiError() which silently swallowed the
                // error (return from the tx callback ≠ return from the route handler).
                throw new Error("ENCRYPTION_NOT_CONFIGURED");
              }
            } else {
              encryptedKeys[provider] = ""; // Clearing a key
            }
          }

          merged.apiKeys = {
            ...existingApiKeys,
            ...encryptedKeys,
          };
        }

        await tx
          .update(users)
          .set({ ...allowedFields, preferences: merged, updatedAt: new Date() })
          .where(eq(users.id, userId));

        return merged;
      });

      allowedFields.preferences = mergedPrefs;
    } else {
      // No preferences to merge — just update the other fields
      if (Object.keys(allowedFields).length === 0) {
        return apiBadRequest("No valid fields to update");
      }

      await db
        .update(users)
        .set({ ...allowedFields, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    return apiSuccess({ updated: true });
  } catch (err) {
    if (err instanceof Error && err.message === "ENCRYPTION_NOT_CONFIGURED") {
      return apiError("API key encryption is not configured. Please contact support.");
    }
    console.error("[api/user/settings] PATCH failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to update settings");
  }
}
