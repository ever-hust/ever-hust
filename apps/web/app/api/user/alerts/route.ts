import { db } from "@repo/db";
import { userAlerts } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "../../../../lib/get-session-user";

const createAlertSchema = z.object({
  frequency: z.enum(["daily", "twice_daily", "weekly"]),
  email: z.string().email().optional(),
  criteria: z
    .object({
      keywords: z.array(z.string()).optional(),
      locations: z.array(z.string()).optional(),
      remoteType: z.string().optional(),
      salary: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),
      skills: z.array(z.string()).optional(),
      roleLevel: z.array(z.string()).optional(),
      industries: z.array(z.string()).optional(),
    })
    .optional(),
});

const patchAlertSchema = z.object({
  alertId: z.number(),
  isActive: z.boolean().optional(),
  frequency: z.enum(["daily", "twice_daily", "weekly"]).optional(),
  criteria: z
    .object({
      keywords: z.array(z.string()).optional(),
      locations: z.array(z.string()).optional(),
      remoteType: z.string().optional(),
      salary: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),
      skills: z.array(z.string()).optional(),
      roleLevel: z.array(z.string()).optional(),
      industries: z.array(z.string()).optional(),
    })
    .optional(),
});

const deleteAlertSchema = z.object({
  alertId: z.number(),
});

// GET /api/user/alerts - List user's alerts
export async function GET() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const alerts = await db
    .select()
    .from(userAlerts)
    .where(eq(userAlerts.userId, user.id));

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

  const body = await req.json();
  const parsed = createAlertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { frequency, email, criteria } = parsed.data;

  const result = await db
    .insert(userAlerts)
    .values({
      userId: user.id,
      frequency,
      email: email ?? user.email,
      criteria: criteria ?? {},
      isActive: true,
    })
    .returning();

  return NextResponse.json({ alert: result[0] }, { status: 201 });
}

// PATCH /api/user/alerts - Toggle active or update an alert
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const body = await req.json();
  const parsed = patchAlertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { alertId, isActive, frequency, criteria } = parsed.data;

  // Ensure the alert belongs to the user
  const existing = await db
    .select()
    .from(userAlerts)
    .where(and(eq(userAlerts.id, alertId), eq(userAlerts.userId, user.id)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (isActive !== undefined) updates.isActive = isActive;
  if (frequency !== undefined) updates.frequency = frequency;
  if (criteria !== undefined) updates.criteria = criteria;

  await db.update(userAlerts).set(updates).where(eq(userAlerts.id, alertId));

  return NextResponse.json({ updated: true });
}

// DELETE /api/user/alerts - Delete an alert
export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const body = await req.json();
  const parsed = deleteAlertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { alertId } = parsed.data;

  // Ensure the alert belongs to the user
  const existing = await db
    .select()
    .from(userAlerts)
    .where(and(eq(userAlerts.id, alertId), eq(userAlerts.userId, user.id)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  await db.delete(userAlerts).where(eq(userAlerts.id, alertId));

  return NextResponse.json({ deleted: true });
}
