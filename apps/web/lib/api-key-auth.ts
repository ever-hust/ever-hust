import { db } from "@repo/db";
import { apiKeys } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";

export interface ApiKeyUser {
  userId: string;
  keyId: number;
  scopes: string[];
  rateLimit: number;
}

/**
 * Validate an API key from the Authorization header.
 * Returns the key owner info or null if invalid.
 */
export async function validateApiKey(
  request: Request
): Promise<ApiKeyUser | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ej_live_")) return null;

  const key = authHeader.slice(7); // Remove "Bearer " prefix
  const keyHash = createHash("sha256").update(key).digest("hex");

  const [record] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      scopes: apiKeys.scopes,
      rateLimit: apiKeys.rateLimit,
      expiresAt: apiKeys.expiresAt,
      isActive: apiKeys.isActive,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!record) return null;
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) return null;

  // Update lastUsedAt (fire-and-forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, record.id))
    .then(() => {})
    .catch(() => {});

  return {
    userId: record.userId,
    keyId: record.id,
    scopes: record.scopes as string[],
    rateLimit: record.rateLimit,
  };
}
