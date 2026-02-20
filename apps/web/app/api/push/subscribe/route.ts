import { db } from "@repo/db";
import { pushSubscriptions } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  parseBody,
} from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../lib/api-response";

// POST /api/push/subscribe - Save push subscription for authenticated user
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
  const validation = parseBody(pushSubscribeSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  try {
    // Upsert: delete any existing subscription for this endpoint, then insert.
    // Wrapped in a transaction to prevent duplicate records from concurrent requests.
    const subscription = await db.transaction(async (tx) => {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, user.id),
            eq(pushSubscriptions.endpoint, body.endpoint),
          ),
        );

      const [sub] = await tx
        .insert(pushSubscriptions)
        .values({
          userId: user.id,
          endpoint: body.endpoint,
          keys: body.keys,
        })
        .returning();

      return sub;
    });

    if (!subscription) {
      return apiError("Failed to save push subscription");
    }

    return apiSuccess({ subscription }, { status: 201 });
  } catch (err) {
    console.error(
      "[api/push/subscribe] POST failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to save push subscription");
  }
}

// DELETE /api/push/subscribe - Remove push subscription for authenticated user
export async function DELETE(req: Request) {
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
  const validation = parseBody(pushUnsubscribeSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const { endpoint } = validation.data;

  try {
    const result = await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, user.id),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      )
      .returning();

    if (result.length === 0) {
      // No subscription found — still return success (idempotent)
      return new NextResponse(null, { status: 204 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(
      "[api/push/subscribe] DELETE failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to remove push subscription");
  }
}
