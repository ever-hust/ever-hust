import { db, chatSessions, chatMessages } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { apiNotFound } from "../../../../../lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/chat/sessions/:id
 * Delete a specific chat session and its messages.
 */
export async function DELETE(_req: Request, context: RouteContext) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const { id } = await context.params;

  // Verify the session belongs to this user
  const session = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, user.id)))
    .limit(1);

  if (session.length === 0) {
    return apiNotFound("Session not found");
  }

  // Delete messages first, then the session
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, id));
  await db
    .delete(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, user.id)));

  return new NextResponse(null, { status: 204 });
}
