// Allow long-running AI streaming responses (Vercel serverless default is 10s)
export const maxDuration = 60;

import { createOrchestratorStream, getModelForUser, getOrgAiConfig, mergeOrgConfig } from "@repo/ai";
import { db, users, organizationMembers } from "@repo/db";
import { convertToModelMessages, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  checkSubscription,
  checkMessageLimit,
} from "../../../../lib/subscription-gate";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { chatRequestSchema } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiBadRequest, apiError, safeJsonParse } from "../../../../lib/api-response";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // API rate limiting (30 req/min for chat)
  const rateLimited = applyRateLimit(userId, "chat");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = chatRequestSchema.safeParse(jsonResult.data);
  if (!parsed.success) {
    return apiBadRequest("Invalid request body", parsed.error.flatten());
  }

  // Guard against oversized payloads: individual messages are capped at 50K chars
  // by the schema, but 100 messages × 50K = 5MB total. Cap aggregate at 500K chars
  // (~500KB) to avoid excessive memory and token costs.
  const totalChars = parsed.data.messages.reduce(
    (sum, m) => sum + m.content.length,
    0
  );
  if (totalChars > 500_000) {
    return apiBadRequest(
      "Total message content is too large. Please start a new conversation or remove older messages."
    );
  }

  const uiMessages = parsed.data.messages as UIMessage[];

  try {
    const messages = await convertToModelMessages(uiMessages);

    const gate = await checkSubscription(userId);

    // Check message rate limit for free users
    const responseHeaders = new Headers();
    if (!gate.isActive) {
      const { allowed, remaining } = await checkMessageLimit(userId);
      if (!allowed) {
        return apiError(
          "Daily message limit reached. Upgrade to Pro for unlimited messages.",
          429,
          { limitType: "messages", remaining: 0 },
        );
      }

      // Pass remaining count to the streaming response
      responseHeaders.set("X-RateLimit-Remaining", String(remaining));
    }

    // Fetch actual user preferences for model selection (BYOK keys, preferred model)
    const userRow = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const preferences = (userRow[0]?.preferences as {
      aiModel?: string;
      apiKeys?: { anthropic?: string; openai?: string; google?: string };
    }) ?? null;

    // Check if the user belongs to an organization and merge org AI config
    const [membership] = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId))
      .limit(1);

    let mergedPreferences = preferences;
    if (membership) {
      const orgConfig = await getOrgAiConfig(membership.organizationId);
      if (orgConfig) {
        const merged = mergeOrgConfig(preferences, orgConfig);
        mergedPreferences = {
          aiModel: merged.preferredModel,
          apiKeys: merged.apiKeys,
        };
      }
    }

    const model = getModelForUser({
      subscriptionStatus: gate.isActive ? "active" : "free",
      preferences: mergedPreferences,
    });

    // createOrchestratorStream is now async (fetches prompt from Langfuse)
    const result = await createOrchestratorStream({
      model,
      messages,
      userId,
      isSubscribed: gate.isActive,
    });

    return result.toUIMessageStreamResponse({ headers: responseHeaders });
  } catch (error) {
    console.error(
      "[api/ai/chat] Error processing chat request:",
      error instanceof Error ? error.stack ?? error.message : error,
    );
    return apiError("Failed to process chat request");
  }
}
