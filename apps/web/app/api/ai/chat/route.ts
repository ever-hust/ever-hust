// Allow long-running AI streaming responses (Vercel serverless default is 10s)
export const maxDuration = 60;

import { createOrchestratorStream, getModelForUser } from "@repo/ai";
import { db, users } from "@repo/db";
import { convertToModelMessages, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkSubscription,
  checkMessageLimit,
} from "../../../../lib/subscription-gate";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { chatRequestSchema } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";

// Allow long-running AI streaming responses (60 seconds)
export const maxDuration = 60;

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.unknown(),
  }).passthrough()).min(1, "At least one message is required"),
});

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

  const body = await req.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const uiMessages = parsed.data.messages as UIMessage[];

  const messages = await convertToModelMessages(uiMessages);

  const gate = await checkSubscription(userId);

  // Check message rate limit for free users
  const responseHeaders = new Headers();
  if (!gate.isActive) {
    const { allowed, remaining } = await checkMessageLimit(userId);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Daily message limit reached. Upgrade to Pro for unlimited messages.",
          limitType: "messages",
          remaining: 0,
        },
        { status: 429 }
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

  const model = getModelForUser({
    subscriptionStatus: gate.isActive ? "active" : "free",
    preferences,
  });

  // createOrchestratorStream is now async (fetches prompt from Langfuse)
  const result = await createOrchestratorStream({
    model,
    messages,
    userId,
    isSubscribed: gate.isActive,
  });

  return result.toUIMessageStreamResponse({ headers: responseHeaders });
}
