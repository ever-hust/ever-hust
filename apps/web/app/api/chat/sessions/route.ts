import { db, chatSessions, chatMessages } from "@repo/db";
import { eq, desc, inArray, asc, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";

/**
 * GET /api/chat/sessions
 * List all chat sessions for the current user (most recent first).
 * Includes a preview (first user message) for each session.
 */
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
    const sessions = await db
      .select({
        id: chatSessions.id,
        status: chatSessions.status,
        agentType: chatSessions.agentType,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
      })
      .from(chatSessions)
      .where(eq(chatSessions.userId, user.id))
      .orderBy(desc(chatSessions.updatedAt))
      .limit(50);

    // Fetch first user message for each session as a preview/title
    const sessionIds = sessions.map((s) => s.id);
    const previews: Map<string, string> = new Map();

    if (sessionIds.length > 0) {
      const firstMessages = await db
        .select({
          sessionId: chatMessages.sessionId,
          content: chatMessages.content,
        })
        .from(chatMessages)
        .where(
          and(
            inArray(chatMessages.sessionId, sessionIds),
            eq(chatMessages.role, "user")
          )
        )
        .orderBy(asc(chatMessages.createdAt));

      // Keep only the first user message per session
      for (const msg of firstMessages) {
        if (msg.content && !previews.has(msg.sessionId)) {
          previews.set(msg.sessionId, msg.content.slice(0, 100));
        }
      }
    }

    const sessionsWithPreviews = sessions.map((s) => ({
      ...s,
      preview: previews.get(s.id) ?? null,
    }));

    return apiSuccess({ sessions: sessionsWithPreviews });
  } catch (err) {
    console.error("[api/chat/sessions] GET failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to load chat sessions");
  }
}

/**
 * POST /api/chat/sessions
 * Create a new chat session.
 */
export async function POST() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const [session] = await db
      .insert(chatSessions)
      .values({
        userId: user.id,
        agentType: "orchestrator",
        status: "active",
      })
      .returning();

    return apiSuccess({ session }, { status: 201 });
  } catch (err) {
    console.error("[api/chat/sessions] POST failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to create chat session");
  }
}

/**
 * DELETE /api/chat/sessions
 * Delete all chat sessions and their messages for the current user.
 */
export async function DELETE() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    // Get all session IDs for this user
    const userSessions = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(eq(chatSessions.userId, user.id));

    const sessionIds = userSessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      // Delete all messages for these sessions first
      await db
        .delete(chatMessages)
        .where(inArray(chatMessages.sessionId, sessionIds));
    }

    // Delete all sessions
    await db
      .delete(chatSessions)
      .where(eq(chatSessions.userId, user.id));

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/chat/sessions] DELETE failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to delete chat sessions");
  }
}
