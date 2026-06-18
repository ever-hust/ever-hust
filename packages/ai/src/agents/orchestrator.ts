import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type StreamTextResult,
} from "ai";
import type { LanguageModel } from "ai";
import { recordChatUsage } from "../credits";
import {
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
} from "../tools";
import { checkSearchLimit, checkCoverLetterLimit } from "../rate-limit";
import { getOrchestratorPrompt } from "../prompts";

/** Maximum agentic tool-use steps the orchestrator may take per chat turn. */
const MAX_AI_STEPS_PER_TURN = 5;

interface OrchestratorOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  userId: string;
  /** Whether the user has an active paid subscription (skips tool-level rate limits). */
  isSubscribed?: boolean;
  /** Selected catalog model key (for credit pricing). */
  modelKey?: string;
  /** When true, debit credits for this call (platform/Hust model, not BYOK). */
  meterCredits?: boolean;
}

export async function createOrchestratorStream({
  model,
  messages,
  userId,
  isSubscribed = false,
  modelKey,
  meterCredits = false,
}: OrchestratorOptions): Promise<StreamTextResult<any, any>> {
  // Fetch system prompt from Langfuse (falls back to hardcoded default)
  const { text: systemPrompt, langfusePrompt } =
    await getOrchestratorPrompt();

  return streamText({
    model,
    system: systemPrompt,
    messages,
    // Meter credit usage for platform (Hust) model calls. BYOK calls use the
    // user's own key and are not charged. Never throws into the stream.
    onFinish: meterCredits
      ? async ({ usage }) => {
          try {
            const u = usage as
              | { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number }
              | undefined;
            const inputTokens = u?.inputTokens ?? u?.promptTokens ?? 0;
            const outputTokens = u?.outputTokens ?? u?.completionTokens ?? 0;
            await recordChatUsage({ userId, modelKey, inputTokens, outputTokens });
          } catch (err) {
            console.error(
              "[credits] failed to record chat usage:",
              err instanceof Error ? err.message : err,
            );
          }
        }
      : undefined,
    // Enable telemetry for Langfuse tracing (OTEL-based)
    experimental_telemetry: {
      isEnabled: true,
      functionId: "orchestrator-chat",
      metadata: {
        userId,
        isSubscribed: String(isSubscribed),
        // Link this generation to the exact Langfuse prompt version
        ...(langfusePrompt
          ? { langfusePrompt: JSON.stringify(langfusePrompt) }
          : {}),
      },
    },
    tools: {
      searchJobs: {
        ...searchJobsTool,
        execute: async (params: any, execOptions: any) => {
          // Enforce free-tier search limit
          if (!isSubscribed) {
            const { allowed, remaining } = await checkSearchLimit(userId);
            if (!allowed) {
              return {
                error:
                  "The user has reached their free-tier search limit (5 searches/day). " +
                  "Let them know they can upgrade to Pro for unlimited searches.",
                limitType: "searches",
                remaining: 0,
                requiresUpgrade: true,
              };
            }
          }
          return searchJobsTool.execute!(params, execOptions);
        },
      },
      updateFilters: updateFiltersTool,
      favoriteJob: {
        ...favoriteJobTool,
        execute: async (params: any, execOptions: any) => {
          return favoriteJobTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      getJobDetails: getJobDetailsTool,
      getUserProfile: {
        ...getUserProfileTool,
        execute: async (_params: any, execOptions: any) => {
          return getUserProfileTool.execute!(
            { userId },
            execOptions
          );
        },
      },
      savePreferences: {
        ...savePreferencesTool,
        execute: async (params: any, execOptions: any) => {
          return savePreferencesTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      generateCoverLetter: {
        ...generateCoverLetterTool,
        execute: async (params: any, execOptions: any) => {
          // Enforce free-tier cover letter limit
          if (!isSubscribed) {
            const { allowed, remaining } = await checkCoverLetterLimit(userId);
            if (!allowed) {
              return {
                error:
                  "The user has reached their free-tier cover letter limit (1 per week). " +
                  "Let them know they can upgrade to Pro for unlimited cover letters.",
                limitType: "coverLetters",
                remaining: 0,
                requiresUpgrade: true,
                generated: false,
              };
            }
          }
          return generateCoverLetterTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      createAlert: {
        ...createAlertTool,
        execute: async (params: any, execOptions: any) => {
          return createAlertTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      applyJob: {
        ...applyJobTool,
        execute: async (params: any, execOptions: any) => {
          return applyJobTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      submitAnswers: {
        ...submitAnswersTool,
        execute: async (params: any, execOptions: any) => {
          return submitAnswersTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      interviewPrep: {
        ...interviewPrepTool,
        execute: async (params: any, execOptions: any) => {
          return interviewPrepTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      companyResearch: companyResearchTool,
      resumeBuilder: {
        ...resumeBuilderTool,
        execute: async (params: any, execOptions: any) => {
          return resumeBuilderTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      salaryInsights: salaryInsightsTool,
      marketInsights: marketInsightsTool,
      updateApplicationStage: {
        ...updateApplicationStageTool,
        execute: async (params: any, execOptions: any) => {
          return updateApplicationStageTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      funnelAnalytics: {
        ...funnelAnalyticsTool,
        execute: async (_params: any, execOptions: any) => {
          return funnelAnalyticsTool.execute!({ userId }, execOptions);
        },
      },
      followUpSuggestions: {
        ...followUpSuggestionsTool,
        execute: async (_params: any, execOptions: any) => {
          return followUpSuggestionsTool.execute!({ userId }, execOptions);
        },
      },
      recordFollowUp: {
        ...recordFollowUpTool,
        execute: async (params: any, execOptions: any) => {
          return recordFollowUpTool.execute!({ ...params, userId }, execOptions);
        },
      },
      learnPreference: {
        ...learnPreferenceTool,
        execute: async (params: any, execOptions: any) => {
          return learnPreferenceTool.execute!({ ...params, userId }, execOptions);
        },
      },
      evaluateJob: {
        ...evaluateJobTool,
        execute: async (params: any, execOptions: any) => {
          // Inject userId + the resolved model server-side (never LLM-provided).
          return evaluateJobTool.execute!(
            { ...params, userId, model },
            execOptions
          );
        },
      },
      draftCoverLetter: {
        ...draftCoverLetterTool,
        execute: async (params: any, execOptions: any) => {
          return draftCoverLetterTool.execute!(
            { ...params, userId, model },
            execOptions
          );
        },
      },
      tailorResume: {
        ...tailorResumeTool,
        execute: async (params: any, execOptions: any) => {
          return tailorResumeTool.execute!({ ...params, userId, model }, execOptions);
        },
      },
      negotiationBrief: {
        ...negotiationBriefTool,
        execute: async (params: any, execOptions: any) => {
          return negotiationBriefTool.execute!({ ...params, userId, model }, execOptions);
        },
      },
      companyDeepDive: {
        ...companyDeepDiveTool,
        execute: async (params: any, execOptions: any) => {
          return companyDeepDiveTool.execute!({ ...params, userId, model }, execOptions);
        },
      },
      draftOutreach: {
        ...draftOutreachTool,
        execute: async (params: any, execOptions: any) => {
          return draftOutreachTool.execute!({ ...params, userId, model }, execOptions);
        },
      },
      careerAdvisor: {
        ...careerAdvisorTool,
        execute: async (params: any, execOptions: any) => {
          return careerAdvisorTool.execute!({ ...params, userId, model }, execOptions);
        },
      },
      captureWritingStyle: {
        ...captureWritingStyleTool,
        execute: async (params: any, execOptions: any) => {
          return captureWritingStyleTool.execute!({ ...params, userId }, execOptions);
        },
      },
      prepInterview: {
        ...prepInterviewTool,
        execute: async (params: any, execOptions: any) => {
          return prepInterviewTool.execute!({ ...params, userId, model }, execOptions);
        },
      },
      batchEvaluate: {
        ...batchEvaluateTool,
        execute: async (params: any, execOptions: any) => {
          return batchEvaluateTool.execute!({ ...params, userId, model }, execOptions);
        },
      },
      applyCopilot: {
        ...applyCopilotTool,
        execute: async (params: any, execOptions: any) => {
          return applyCopilotTool.execute!({ ...params, userId, model }, execOptions);
        },
      },
    },
    stopWhen: stepCountIs(MAX_AI_STEPS_PER_TURN),
  });
}
