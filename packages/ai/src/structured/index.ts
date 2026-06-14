export {
  defineArtifact,
  assertArtifact,
  ArtifactValidationError,
} from "./contract";
export type {
  Artifact,
  ArtifactDefinition,
  AssertOptions,
} from "./contract";

export { runValidatedGeneration, generateValidatedObject } from "./generate";
export type { GenerateValidatedOptions } from "./generate";

export {
  EVALUATION_SCHEMA_VERSION,
  evaluationArtifact,
  evaluationSummarySchema,
  evaluationLlmPartSchema,
  evaluationBlocksSchema,
  evaluationDimensionSchema,
  evaluationBandSchema,
  budgetFitSchema,
} from "./schemas/evaluation";
export type {
  EvaluationSummary,
  EvaluationLlmPart,
  EvaluationBlocks,
  EvaluationDimension,
  EvaluationBand,
  BudgetFit,
  DimensionSource,
} from "./schemas/evaluation";

export {
  COVER_LETTER_SCHEMA_VERSION,
  coverLetterArtifact,
  coverLetterDraftSchema,
  coverLetterSummarySchema,
} from "./schemas/cover-letter";
export type { CoverLetterDraft, CoverLetterSummary } from "./schemas/cover-letter";

export {
  RESUME_SCHEMA_VERSION,
  resumeArtifact,
  resumeDraftSchema,
  resumeSummarySchema,
} from "./schemas/resume";
export type { ResumeDraft, ResumeSummary } from "./schemas/resume";

export {
  NEGOTIATION_SCHEMA_VERSION,
  negotiationArtifact,
  negotiationDraftSchema,
  negotiationSummarySchema,
} from "./schemas/negotiation";
export type { NegotiationDraft, NegotiationSummary } from "./schemas/negotiation";

export {
  COMPANY_RESEARCH_SCHEMA_VERSION,
  companyResearchArtifact,
  companyResearchDraftSchema,
  companyResearchSummarySchema,
} from "./schemas/company-research";
export type {
  CompanyResearchDraft,
  CompanyResearchSummary,
} from "./schemas/company-research";

export {
  OUTREACH_SCHEMA_VERSION,
  outreachArtifact,
  outreachDraftSchema,
  outreachSummarySchema,
} from "./schemas/outreach";
export type { OutreachDraft, OutreachSummary } from "./schemas/outreach";

export {
  CAREER_GROWTH_SCHEMA_VERSION,
  careerGrowthArtifact,
  careerGrowthLlmPartSchema,
  careerGrowthSummarySchema,
} from "./schemas/career-growth";
export type {
  CareerGrowthLlmPart,
  CareerGrowthSummary,
  GrowthRecommendation,
} from "./schemas/career-growth";
