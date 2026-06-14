import { z } from "zod";
import type { NextResponse } from "next/server";
import { decideApprovalGate } from "@ever-hust/ai";
import { requireSessionUser } from "../../../lib/get-session-user";
import { applyRateLimit } from "../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../lib/api-response";

const approvalDecisionSchema = z.object({
  gateId: z.number().int().positive(),
  decision: z.enum(["approved", "denied"]),
});

// POST /api/approvals — approve or deny a pending outward-action gate (spec #6).
// The human-in-the-loop state transition; an outward-action tool only proceeds once its
// gate is approved here.
export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = approvalDecisionSchema.safeParse(jsonResult.data);
  if (!parsed.success) return apiBadRequest("Invalid approval decision");

  try {
    const { ok } = await decideApprovalGate({
      gateId: parsed.data.gateId,
      userId,
      decision: parsed.data.decision,
    });
    if (!ok) return apiError("No pending approval gate found", 404);
    return apiSuccess({
      ok: true,
      gateId: parsed.data.gateId,
      decision: parsed.data.decision,
    });
  } catch (err) {
    console.error(
      "[api/approvals] POST failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to record approval decision");
  }
}
