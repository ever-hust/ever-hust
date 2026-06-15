export { getModelForUser } from "./model-router";
export { createOrchestratorStream } from "./agents/orchestrator";
export { checkSearchLimit, checkCoverLetterLimit } from "./rate-limit";
export { getOrchestratorPrompt, getPrompt } from "./prompts";
export type { PromptMeta } from "./prompts";
export { getOrgAiConfig, mergeOrgConfig } from "./org-config";
export type { OrgAiConfigRow, MergedAiConfig } from "./org-config";

// Structured-output / machine-summary contract (spec #5)
export {
  defineArtifact,
  assertArtifact,
  ArtifactValidationError,
  runValidatedGeneration,
  generateValidatedObject,
  EVALUATION_SCHEMA_VERSION,
  evaluationArtifact,
  evaluationSummarySchema,
  evaluationLlmPartSchema,
  evaluationBlocksSchema,
  evaluationDimensionSchema,
  evaluationBandSchema,
  budgetFitSchema,
} from "./structured";
export type {
  Artifact,
  ArtifactDefinition,
  AssertOptions,
  GenerateValidatedOptions,
  EvaluationSummary,
  EvaluationLlmPart,
  EvaluationBlocks,
  EvaluationDimension,
  EvaluationBand,
  DimensionSource,
} from "./structured";

// Ethical-guardrail policy primitives (spec #6)
export * from "./policy";
export {
  searchJobsTool,
  updateFiltersTool,
  favoriteJobTool,
  getJobDetailsTool,
  getUserProfileTool,
  savePreferencesTool,
  generateCoverLetterTool,
  createAlertTool,
  applyJobTool,
  submitAnswersTool,
  interviewPrepTool,
  companyResearchTool,
  resumeBuilderTool,
  salaryInsightsTool,
  evaluateJobTool,
  runEvaluateJob,
  marketInsightsTool,
  updateApplicationStageTool,
  funnelAnalyticsTool,
  followUpSuggestionsTool,
  recordFollowUpTool,
  learnPreferenceTool,
  draftCoverLetterTool,
  tailorResumeTool,
  negotiationBriefTool,
  companyDeepDiveTool,
  draftOutreachTool,
  careerAdvisorTool,
  captureWritingStyleTool,
  prepInterviewTool,
  batchEvaluateTool,
  applyCopilotTool,
} from "./tools";

// Application pipeline stages (spec #2)
export {
  PIPELINE_STAGES,
  STAGE_LABELS,
  ACTIVE_STAGES,
  TERMINAL_STAGES,
  isValidStage,
  isTerminalStage,
} from "./pipeline/stages";
export type { PipelineStage } from "./pipeline/stages";

// Batch-evaluation planner (spec #19) — consumed by the Trigger.dev background task
export { planBatchEvaluation } from "./evaluation/batch";
export type { BatchPlan, BatchCandidate } from "./evaluation/batch";
