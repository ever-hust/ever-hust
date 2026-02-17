import { db } from "@repo/db";
import { userAlerts } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { checkSubscription } from "../../../../lib/subscription-gate";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  alertCreateSchema,
  alertPatchSchema,
  alertDeleteSchema,
  parseBody,
} from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiError,
} from "../../../../lib/api-response";

// GET /api/user/alerts - List user's alerts
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
    const alerts = await db
      .select()
      .from(userAlerts)
      .where(eq(userAlerts.userId, user.id))
      .orderBy(userAlerts.createdAt);

    return apiSuccess({ alerts });
  } catch (err) {
    console.error("[api/user/alerts] GET failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to load alerts");
  }
}

// POST /api/user/alerts - Create a new alert
export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimitedPost = applyRateLimit(user.id, "authenticated");
  if (rateLimitedPost) return rateLimitedPost;

  // Only subscribed users can create alerts
  const gate = await checkSubscription(user.id);
  if (!gate.isActive) {
    return apiForbidden("Upgrade to Pro to create job alerts.");
  }

  const rawBody = await req.json();
  const validation = parseBody(alertCreateSchema, rawBody);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  try {
    const [alert] = await db
      .insert(userAlerts)
      .values({
        userId: user.id,
        frequency: body.frequency,
        email: body.email,
        criteria: body.criteria ?? null,
      })
      .returning();

    return apiSuccess({ alert }, { status: 201 });
  } catch (err) {
    console.error("[api/user/alerts] POST failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to create alert");
  }
}

// PATCH /api/user/alerts - Update an alert (expects { id, ...fields })
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimitedPatch = applyRateLimit(user.id, "authenticated");
  if (rateLimitedPatch) return rateLimitedPatch;

  const rawBody = await req.json();
  const validation = parseBody(alertPatchSchema, rawBody);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  // Build update fields
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.frequency !== undefined) updates.frequency = body.frequency;
  if (body.email !== undefined) updates.email = body.email;
  if (body.criteria !== undefined) updates.criteria = body.criteria;

  try {
    const result = await db
      .update(userAlerts)
      .set(updates)
      .where(and(eq(userAlerts.id, body.id), eq(userAlerts.userId, user.id)))
      .returning();

    if (result.length === 0) {
      return apiNotFound("Alert not found");
    }

    return apiSuccess({ alert: result[0] });
  } catch (err) {
    console.error("[api/user/alerts] PATCH failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to update alert");
  }
}

// DELETE /api/user/alerts - Delete an alert (expects { id })
export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimitedDelete = applyRateLimit(user.id, "authenticated");
  if (rateLimitedDelete) return rateLimitedDelete;

  const rawBody = await req.json();
  const validation = parseBody(alertDeleteSchema, rawBody);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const { id } = validation.data;

  try {
    const result = await db
      .delete(userAlerts)
      .where(and(eq(userAlerts.id, id), eq(userAlerts.userId, user.id)))
      .returning();

    if (result.length === 0) {
      return apiNotFound("Alert not found");
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/user/alerts] DELETE failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to delete alert");
  }
}
