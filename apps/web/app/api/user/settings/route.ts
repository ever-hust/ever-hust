import { db } from "@repo/db";
import { users } from "@repo/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "../../../../lib/get-session-user";

const settingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  headline: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  preferences: z.record(z.unknown()).optional(),
});

// PATCH /api/user/settings - Update user settings
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const raw = await req.json();
  const parsed = settingsSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // Only allow updating specific fields
  const allowedFields: Record<string, unknown> = {};

  if (body.name !== undefined) allowedFields.name = body.name;
  if (body.headline !== undefined) allowedFields.headline = body.headline;
  if (body.location !== undefined) allowedFields.location = body.location;

  // Handle preferences merge
  if (body.preferences) {
    const existing = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const existingPrefs =
      (existing[0]?.preferences as Record<string, unknown>) ?? {};
    allowedFields.preferences = {
      ...existingPrefs,
      ...(body.preferences as Record<string, unknown>),
    };
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ ...allowedFields, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return NextResponse.json({ updated: true });
}
