import { createOrchestratorStream, getModelForUser } from "@repo/ai";
import { db, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { convertToModelMessages, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkSubscription,
  checkMessageLimit,
} from "../../../../lib/subscription-gate";
import { requireSessionUser } from "../../../../lib/get-session-user";

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

  const raw = await req.json();
  const parsed = chatSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const uiMessages = parsed.data.messages as UIMessage[];

  const messages = await convertToModelMessages(uiMessages);

  const gate = await checkSubscription(userId);

  // Check message rate limit for free users
  if (!gate.isActive) {
    const { allowed, remaining } = checkMessageLimit(userId);
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

    // Add remaining count header so client can show it
    const headers = new Headers();
    headers.set("X-RateLimit-Remaining", String(remaining));
  }

  // Fetch user preferences from DB for BYOK / model selection
  const userRecord = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const preferences = (userRecord[0]?.preferences as Record<string, unknown> | null) ?? null;

  const model = getModelForUser({
    subscriptionStatus: gate.isActive ? "active" : "free",
    preferences,
  });

  const result = createOrchestratorStream({
    model,
    messages,
    userId,
    isSubscribed: gate.isActive,
  });

  return result.toUIMessageStreamResponse();
}
