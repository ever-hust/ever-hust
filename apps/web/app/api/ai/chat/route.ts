// Allow long-running AI streaming responses (Vercel serverless default is 10s).
// Segment config exports must be literal values for Next.js static analysis.
export const maxDuration = 60;

import { MAX_CHAT_PAYLOAD_CHARS } from "@/lib/constants";

import { createOrchestratorStream, getModelForUser, getOrgAiConfig, mergeOrgConfig } from "@ever-hust/ai";
import { db, users, organizationMembers } from "@ever-hust/db";
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

  // A message's text lives in `content` (legacy) or in its text `parts` (AI SDK v6).
  const messageText = (m: {
    content?: string;
    parts?: Array<{ type: string; [k: string]: unknown }>;
  }): string =>
    m.content ??
    (m.parts ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");

  // Guard against oversized payloads: individual messages are capped at 50K chars
  // by the schema, but 100 messages × 50K = 5MB total. Cap aggregate at 500K chars
  // (~500KB) to avoid excessive memory and token costs.
  const totalChars = parsed.data.messages.reduce(
    (sum, m) => sum + messageText(m).length,
    0
  );
  if (totalChars > MAX_CHAT_PAYLOAD_CHARS) {
    return apiBadRequest(
      "Total message content is too large. Please start a new conversation or remove older messages."
    );
  }

  // Ensure every message has `parts` — the AI SDK's convertToModelMessages
  // accesses `message.parts.filter(...)` directly, so messages with only
  // `content` (no `parts`) would crash at runtime despite the `as UIMessage[]` cast.
  const uiMessages = parsed.data.messages.map((m) => ({
    ...m,
    parts: m.parts ?? (m.content ? [{ type: "text" as const, text: m.content }] : []),
  })) as UIMessage[];

  try {
    const messages = await convertToModelMessages(uiMessages);

    const gate = await checkSubscription(userId);

    // Ensure streaming response is never cached (user-specific data)
    const responseHeaders = new Headers({
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    });
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
    let preferences: {
      aiModel?: string;
      apiKeys?: { anthropic?: string; openai?: string; google?: string };
    } | null = null;
    try {
      const userRow = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      preferences = (userRow[0]?.preferences as typeof preferences) ?? null;
    } catch (prefError) {
      console.warn(
        "[api/ai/chat] Failed to fetch user preferences, using defaults:",
        prefError instanceof Error ? prefError.message : prefError,
      );
    }

    // Check if the user belongs to an organization and merge org AI config
    let mergedPreferences: {
      aiModel?: string;
      apiKeys?: { anthropic?: string; openai?: string; google?: string };
    } | null = preferences;
    try {
      const [membership] = await db
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, userId))
        .limit(1);

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
    } catch (orgError) {
      console.warn(
        "[api/ai/chat] Failed to fetch org config, using user preferences only:",
        orgError instanceof Error ? orgError.message : orgError,
      );
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

    // UUID message ids so persisted assistant messages satisfy the chat_messages
    // UUID primary key (and the save route's id.uuid() schema).
    return result.toUIMessageStreamResponse({
      headers: responseHeaders,
      generateMessageId: () => crypto.randomUUID(),
    });
  } catch (error) {
    console.error(
      "[api/ai/chat] Error processing chat request:",
      error instanceof Error ? error.stack ?? error.message : error,
    );
    return apiError("Failed to process chat request");
  }
}
