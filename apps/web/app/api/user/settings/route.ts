import { db } from "@repo/db";
import { users } from "@repo/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";

// PATCH /api/user/settings - Update user settings
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const body = (await req.json()) as Record<string, unknown>;

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
