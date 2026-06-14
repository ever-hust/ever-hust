import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type StreamTextResult,
} from "ai";
import type { LanguageModel } from "ai";
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
}

export async function createOrchestratorStream({
  model,
  messages,
  userId,
  isSubscribed = false,
}: OrchestratorOptions): Promise<StreamTextResult<any, any>> {
  // Fetch system prompt from Langfuse (falls back to hardcoded default)
  const { text: systemPrompt, langfusePrompt } =
    await getOrchestratorPrompt();

  return streamText({
    model,
    system: systemPrompt,
    messages,
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
    },
    stopWhen: stepCountIs(MAX_AI_STEPS_PER_TURN),
  });
}
