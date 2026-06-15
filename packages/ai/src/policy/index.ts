// Ethical-guardrail policy primitives (spec #6) — the shared HITL / no-invent / cost / cadence
// building blocks every AI feature inherits.

export {
  OUTWARD_ACTION_TOOLS,
  isOutwardAction,
  createApprovalGate,
  decideApprovalGate,
  assertApproved,
  APPROVAL_TTL_MS,
} from "./require-approval";
export type { OutwardActionTool } from "./require-approval";

export {
  assertNoInvented,
  evaluateNoInvent,
  assertGrounded,
  NoInventError,
  DEFAULT_NO_INVENT_POLICY,
} from "./assert-no-invented";
export type {
  NoInventedResult,
  NoInventPolicy,
  NoInventMode,
  NoInventDecision,
} from "./assert-no-invented";

export { evaluateCostGate, withCostGate } from "./cost-gate";
export type { CostGateInput, CostGateDecision, CostGateReason } from "./cost-gate";

export {
  DEFAULT_FOLLOW_UP_POLICY,
  canSendFollowUp,
} from "./follow-up-policy";
export type { FollowUpPolicy, FollowUpReason } from "./follow-up-policy";

export {
  FREE_LIMITS,
  EVALUATIONS_FREE_PER_DAY,
  BATCH_EVAL_MAX_CONCURRENCY,
  DEFAULT_SCORE_FLOOR,
} from "./limits";
