import { db, chatSessions, chatMessages } from "@repo/db";
import { eq, and, asc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUser } from "../../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiNotFound, safeJsonParse } from "../../../../../../lib/api-response";
import { z } from "zod";

const saveMessagesSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().max(100),
        role: z.enum(["user", "assistant", "system", "tool"]),
        content: z.string().max(50_000).nullable().optional(),
        toolCalls: z.unknown().nullable().optional(),
        toolResults: z.unknown().nullable().optional(),
        metadata: z.unknown().nullable().optional(),
      })
    )
    .min(1)
    .max(100),
});

/**
 * GET /api/chat/sessions/[id]/messages
 * Load all messages for a session. Validates session ownership.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const { id: sessionId } = await params;

  // Verify session belongs to user
  const session = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id))
    )
    .limit(1);

  if (session.length === 0) {
    return apiNotFound("Session not found");
  }

  const messages = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      toolCalls: chatMessages.toolCalls,
      toolResults: chatMessages.toolResults,
      metadata: chatMessages.metadata,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));

  return apiSuccess({ messages });
}

/**
 * POST /api/chat/sessions/[id]/messages
 * Save a batch of messages. Upsert-like: skips messages with IDs that already exist.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const { id: sessionId } = await params;

  // Verify session belongs to user
  const session = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id))
    )
    .limit(1);

  if (session.length === 0) {
    return apiNotFound("Session not found");
  }

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = saveMessagesSchema.safeParse(jsonResult.data);
  if (!parsed.success) {
    return apiBadRequest("Invalid request body", parsed.error.flatten());
  }

  // Insert messages (using onConflictDoNothing to skip duplicates)
  const rows = parsed.data.messages.map((m) => ({
    id: m.id,
    sessionId,
    role: m.role as "user" | "assistant" | "system" | "tool",
    content: m.content ?? null,
    toolCalls: m.toolCalls ?? null,
    toolResults: m.toolResults ?? null,
    metadata: m.metadata ?? null,
  }));

  await db.insert(chatMessages).values(rows).onConflictDoNothing();

  // Touch session updatedAt
  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId));

  return apiSuccess({ saved: rows.length });
}
