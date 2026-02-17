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

  const alerts = await db
    .select()
    .from(userAlerts)
    .where(eq(userAlerts.userId, user.id))
    .orderBy(userAlerts.createdAt);

  return NextResponse.json({ alerts });
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
    return NextResponse.json(
      { error: "Upgrade to Pro to create job alerts." },
      { status: 403 }
    );
  }

  const rawBody = await req.json();
  const validation = parseBody(alertCreateSchema, rawBody);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const body = validation.data;

  const [alert] = await db
    .insert(userAlerts)
    .values({
      userId: user.id,
      frequency: body.frequency,
      email: body.email,
      criteria: body.criteria ?? null,
    })
    .returning();

  return NextResponse.json({ alert }, { status: 201 });
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
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const body = validation.data;

  // Build update fields
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.frequency !== undefined) updates.frequency = body.frequency;
  if (body.email !== undefined) updates.email = body.email;
  if (body.criteria !== undefined) updates.criteria = body.criteria;

  const result = await db
    .update(userAlerts)
    .set(updates)
    .where(and(eq(userAlerts.id, body.id), eq(userAlerts.userId, user.id)))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  return NextResponse.json({ alert: result[0] });
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
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { id } = validation.data;

  const result = await db
    .delete(userAlerts)
    .where(and(eq(userAlerts.id, id), eq(userAlerts.userId, user.id)))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
