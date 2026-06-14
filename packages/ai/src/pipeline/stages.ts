/**
 * Application pipeline stages (spec #2 — Applications Kanban).
 *
 * The user's tracking stage for an application, distinct from the apply-action `status`
 * (pending/in_progress/submitted/failed) on the `applications` row. Pure data + helpers so
 * the tool, the API route, and the board UI share one source of truth.
 */
export const PIPELINE_STAGES = [
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Stages from which no further forward progress is expected. */
export const TERMINAL_STAGES: readonly PipelineStage[] = ["rejected", "withdrawn"];

export function isValidStage(stage: string): stage is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(stage);
}

export function isTerminalStage(stage: PipelineStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

/** Ordered, active (non-terminal) stages — the columns a Kanban board shows first. */
export const ACTIVE_STAGES: readonly PipelineStage[] = PIPELINE_STAGES.filter(
  (s) => !TERMINAL_STAGES.includes(s),
);
