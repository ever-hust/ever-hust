import { createOrchestratorStream, getModelForUser } from "@repo/ai";
import { convertToModelMessages, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import {
  checkSubscription,
  checkMessageLimit,
} from "../../../../lib/subscription-gate";
import { requireSessionUser } from "../../../../lib/get-session-user";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const { messages: uiMessages } = (await req.json()) as {
    messages: UIMessage[];
  };

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

  const model = getModelForUser({
    subscriptionStatus: gate.isActive ? "active" : "free",
    preferences: null,
  });

  const result = createOrchestratorStream({
    model,
    messages,
    userId,
    isSubscribed: gate.isActive,
  });

  return result.toUIMessageStreamResponse();
}
