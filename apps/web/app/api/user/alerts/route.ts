import { db } from "@ever-hust/db";
import { userAlerts } from "@ever-hust/db";
import { MAX_ALERTS_PER_USER } from "@ever-hust/utils";
import { eq, and, count, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { checkSubscription } from "../../../../lib/subscription-gate";
import { alertsRequireProMessage } from "../../../../lib/payments";
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
  safeJsonParse,
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
      .orderBy(userAlerts.createdAt)
      .limit(100);

    return apiSuccess({ alerts }, { cacheSeconds: 0, isPrivate: true });
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

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(alertCreateSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  try {
    // Only subscribed users can create alerts
    const gate = await checkSubscription(user.id);
    if (!gate.isActive) {
      return apiForbidden(alertsRequireProMessage());
    }

    const result = await db.transaction(async (tx) => {
      // One create per user at a time, so concurrent requests can't all pass
      // the cap check below. Same lock as the AI create-alert tool.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('user-alerts-create'), hashtext(${user.id}))`,
      );

      const [existing] = await tx
        .select({ value: count() })
        .from(userAlerts)
        .where(eq(userAlerts.userId, user.id));
      if ((existing?.value ?? 0) >= MAX_ALERTS_PER_USER) {
        return { capped: true as const };
      }

      // Alerts go only to the account email, never to an address from the body.
      const [created] = await tx
        .insert(userAlerts)
        .values({
          userId: user.id,
          frequency: body.frequency,
          email: user.email,
          criteria: body.criteria ?? null,
        })
        .returning();
      return { capped: false as const, alert: created };
    });

    if (result.capped) {
      return apiBadRequest(
        `You can have at most ${MAX_ALERTS_PER_USER} job alerts. Delete one before creating another.`,
      );
    }
    const alert = result.alert;
    if (!alert) {
      return apiError("Failed to create alert");
    }

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

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(alertPatchSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  // Alerts go only to the account email, so an alert's email can't be changed.
  if (
    body.email !== undefined &&
    body.email.toLowerCase() !== user.email.toLowerCase()
  ) {
    return apiBadRequest(
      "Job alerts are sent to your account email; it can't be changed per alert.",
    );
  }

  // Build update fields
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.frequency !== undefined) updates.frequency = body.frequency;
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

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(alertDeleteSchema, jsonResult.data);
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

    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    });
  } catch (err) {
    console.error("[api/user/alerts] DELETE failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to delete alert");
  }
}
