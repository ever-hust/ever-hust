import { db, approvalGates } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";

/**
 * Structural human-approval gate (spec #6 §3, constitution Article 4).
 *
 * Any tool that performs an OUTWARD action (apply, submit answers, send outreach) must route
 * through an `approval_gates` row that a human explicitly approves. Because approval is a
 * server-side state transition, no prompt instruction or jailbreak can skip it. New outward
 * tools MUST be added to {@link OUTWARD_ACTION_TOOLS} — the invariant test fails CI otherwise.
 */
export const OUTWARD_ACTION_TOOLS = [
  "applyJob",
  "submitAnswers",
  "sendOutreach",
  "applyCopilotSubmit",
] as const;

export type OutwardActionTool = (typeof OUTWARD_ACTION_TOOLS)[number];

export function isOutwardAction(tool: string): boolean {
  return (OUTWARD_ACTION_TOOLS as readonly string[]).includes(tool);
}

/** Approval gates auto-deny if not acted on within this window. */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export async function createApprovalGate(input: {
  userId: string;
  tool: OutwardActionTool;
  actionId: string;
  summary?: Record<string, unknown>;
  now?: Date;
}): Promise<{ gateId: number; status: "pending" }> {
  const now = input.now ?? new Date();
  const rows = await db
    .insert(approvalGates)
    .values({
      userId: input.userId,
      tool: input.tool,
      actionId: input.actionId,
      summary: input.summary ?? null,
      status: "pending",
      expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
    })
    .returning({ id: approvalGates.id });
  return { gateId: rows[0]!.id, status: "pending" };
}

export async function decideApprovalGate(input: {
  gateId: number;
  userId: string;
  decision: "approved" | "denied";
  now?: Date;
}): Promise<{ ok: boolean }> {
  const now = input.now ?? new Date();
  const rows = await db
    .update(approvalGates)
    .set({ status: input.decision, decidedAt: now, updatedAt: now })
    .where(
      and(
        eq(approvalGates.id, input.gateId),
        eq(approvalGates.userId, input.userId),
        eq(approvalGates.status, "pending"),
      ),
    )
    .returning({ id: approvalGates.id });
  return { ok: rows.length > 0 };
}

/**
 * The enforcement check an outward-action tool calls before its side-effecting path: returns
 * true only for an approved, non-expired gate owned by the user.
 */
export async function assertApproved(input: {
  gateId: number;
  userId: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await db
    .select({ status: approvalGates.status, expiresAt: approvalGates.expiresAt })
    .from(approvalGates)
    .where(
      and(
        eq(approvalGates.id, input.gateId),
        eq(approvalGates.userId, input.userId),
      ),
    )
    .limit(1);
  const gate = rows[0];
  if (!gate || gate.status !== "approved") return false;
  if (gate.expiresAt && gate.expiresAt.getTime() < now.getTime()) return false;
  return true;
}
