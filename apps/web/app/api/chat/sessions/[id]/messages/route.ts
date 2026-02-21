import { db, chatSessions, chatMessages } from "@ever-hust/db";
import { eq, and, asc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUser } from "../../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiNotFound, apiError, safeJsonParse } from "../../../../../../lib/api-response";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cap JSONB fields to prevent DoS via oversized payloads
const boundedJson = z.unknown().nullable().optional().refine(
  (val) => val == null || JSON.stringify(val).length <= 100_000,
  { message: "JSON payload too large (max 100KB)" },
);

const saveMessagesSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().uuid(),
        role: z.enum(["user", "assistant", "system", "tool"]),
        content: z.string().max(50_000).nullable().optional(),
        toolCalls: boundedJson,
        toolResults: boundedJson,
        metadata: boundedJson,
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

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const { id: sessionId } = await params;

  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return apiBadRequest("Invalid session ID");
  }

  try {
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
      .orderBy(asc(chatMessages.createdAt))
      .limit(500);

    return apiSuccess({ messages });
  } catch (error) {
    console.error("[api/chat/messages/GET]", error instanceof Error ? error.message : error);
    return apiError("Failed to load messages");
  }
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

  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return apiBadRequest("Invalid session ID");
  }

  try {
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

    // Wrap insert + session timestamp bump in a transaction so they
    // stay consistent if the server crashes mid-operation.
    const inserted = await db.transaction(async (tx) => {
      const ins = await tx
        .insert(chatMessages)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: chatMessages.id });

      // Only bump session timestamp when new messages were actually inserted
      if (ins.length > 0) {
        await tx
          .update(chatSessions)
          .set({ updatedAt: new Date() })
          .where(eq(chatSessions.id, sessionId));
      }

      return ins;
    });

    return apiSuccess({ saved: inserted.length });
  } catch (error) {
    console.error("[api/chat/messages/POST]", error instanceof Error ? error.message : error);
    return apiError("Failed to save messages");
  }
}
