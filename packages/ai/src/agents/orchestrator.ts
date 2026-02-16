import { streamText, stepCountIs, type ModelMessage } from "ai";
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
  interviewPrepTool,
  submitAnswersTool,
} from "../tools";
import { checkSearchLimit, checkCoverLetterLimit } from "../rate-limit";
import { getOrchestratorPrompt } from "../prompts";

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
}: OrchestratorOptions) {
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
        execute: async (params, execOptions) => {
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
        execute: async (params) => {
          return favoriteJobTool.execute!(
            { ...params, userId },
            { toolCallId: "", messages: [], abortSignal: undefined as never }
          );
        },
      },
      getJobDetails: getJobDetailsTool,
      getUserProfile: {
        ...getUserProfileTool,
        execute: async () => {
          return getUserProfileTool.execute!(
            { userId },
            { toolCallId: "", messages: [], abortSignal: undefined as never }
          );
        },
      },
      savePreferences: {
        ...savePreferencesTool,
        execute: async (params) => {
          return savePreferencesTool.execute!(
            { ...params, userId },
            { toolCallId: "", messages: [], abortSignal: undefined as never }
          );
        },
      },
      generateCoverLetter: {
        ...generateCoverLetterTool,
        execute: async (params) => {
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
            { toolCallId: "", messages: [], abortSignal: undefined as never }
          );
        },
      },
      createAlert: {
        ...createAlertTool,
        execute: async (params) => {
          return createAlertTool.execute!(
            { ...params, userId },
            { toolCallId: "", messages: [], abortSignal: undefined as never }
          );
        },
      },
      applyJob: {
        ...applyJobTool,
        execute: async (params) => {
          return applyJobTool.execute!(
            { ...params, userId },
            { toolCallId: "", messages: [], abortSignal: undefined as never }
          );
        },
      },
      interviewPrep: {
        ...interviewPrepTool,
        execute: async (params) => {
          return interviewPrepTool.execute!(
            { ...params, userId },
            { toolCallId: "", messages: [], abortSignal: undefined as never }
          );
        },
      },
      submitAnswers: {
        ...submitAnswersTool,
        execute: async (params) => {
          return submitAnswersTool.execute!(
            { ...params, userId },
            { toolCallId: "", messages: [], abortSignal: undefined as never }
          );
        },
      },
    },
    stopWhen: stepCountIs(5),
  });
}
