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
  submitAnswersTool,
  interviewPrepTool,
} from "../tools";
import { checkSearchLimit, checkCoverLetterLimit } from "../rate-limit";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "../prompts";

interface OrchestratorOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  userId: string;
  /** Whether the user has an active paid subscription (skips tool-level rate limits). */
  isSubscribed?: boolean;
}

export function createOrchestratorStream({
  model,
  messages,
  userId,
  isSubscribed = false,
}: OrchestratorOptions) {
  return streamText({
    model,
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    messages,
    tools: {
      searchJobs: {
        ...searchJobsTool,
        execute: async (params, execOptions) => {
          // Enforce free-tier search limit
          if (!isSubscribed) {
            const { allowed, remaining } = checkSearchLimit(userId);
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
        execute: async (params, execOptions) => {
          return favoriteJobTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      getJobDetails: getJobDetailsTool,
      getUserProfile: {
        ...getUserProfileTool,
        execute: async (_params, execOptions) => {
          return getUserProfileTool.execute!(
            { userId },
            execOptions
          );
        },
      },
      savePreferences: {
        ...savePreferencesTool,
        execute: async (params, execOptions) => {
          return savePreferencesTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      generateCoverLetter: {
        ...generateCoverLetterTool,
        execute: async (params, execOptions) => {
          // Enforce free-tier cover letter limit
          if (!isSubscribed) {
            const { allowed, remaining } = checkCoverLetterLimit(userId);
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
        execute: async (params, execOptions) => {
          return createAlertTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      applyJob: {
        ...applyJobTool,
        execute: async (params, execOptions) => {
          return applyJobTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      submitAnswers: {
        ...submitAnswersTool,
        execute: async (params, execOptions) => {
          return submitAnswersTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
      interviewPrep: {
        ...interviewPrepTool,
        execute: async (params, execOptions) => {
          return interviewPrepTool.execute!(
            { ...params, userId },
            execOptions
          );
        },
      },
    },
    stopWhen: stepCountIs(5),
  });
}
