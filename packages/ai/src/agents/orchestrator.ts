import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type StreamTextResult,
} from "ai";
import type { LanguageModel } from "ai";
import { recordChatUsage } from "../credits";
import type { FallbackState } from "../credit-fallback";
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
  getInboxThreadsTool,
  getInboxThreadTool,
} from "../tools";
import { checkSearchLimit, checkCoverLetterLimit } from "../rate-limit";
import { getOrchestratorPrompt } from "../prompts";
import { freeLimitGuidance } from "../payments";

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
  /** Set by the model wrapper when a free fallback model answered (see credit-fallback.ts). */
  fallbackState?: FallbackState;
  /** The member's organization AI config: custom prompt, appended to the base prompt. */
  orgSystemPrompt?: string;
  /** The member's organization AI config: sampling temperature. */
  temperature?: number;
  /** The member's organization AI config: max tokens per model response. */
  maxOutputTokens?: number;
}

export async function createOrchestratorStream({
  model,
  messages,
  userId,
  isSubscribed = false,
  modelKey,
  meterCredits = false,
  fallbackState,
  orgSystemPrompt,
  temperature,
  maxOutputTokens,
}: OrchestratorOptions): Promise<StreamTextResult<any, any>> {
  // Fetch system prompt from Langfuse (falls back to hardcoded default)
  const { text: basePrompt, langfusePrompt } =
    await getOrchestratorPrompt();

  // An org admin's custom prompt is added after the base prompt, never in
  // place of it, so the tool and safety instructions still apply.
  const orgInstructions = orgSystemPrompt?.trim();
  const systemPrompt = orgInstructions
    ? `${basePrompt}\n\nOrganization instructions:\n${orgInstructions}`
    : basePrompt;

  return streamText({
    model,
    system: systemPrompt,
    messages,
    // Org sampling settings; left out when unset so the provider default applies.
    ...(temperature != null ? { temperature } : {}),
    ...(maxOutputTokens != null ? { maxOutputTokens } : {}),
    // Meter credit usage for platform (Hust) model calls. BYOK calls use the
    // user's own key and are not charged. Never throws into the stream.
    onFinish: meterCredits
      ? async ({ usage, steps }) => {
          // A free model answered because platform credits ran out: the user did
          // not get (and must not pay for) the selected model. If credits ran out
          // mid-turn, the earlier paid steps go unbilled too — in the user's favour.
          if (fallbackState?.usedFallback) return;
          try {
            // A tool-calling turn runs several model steps, and each one re-sends
            // the system prompt, the history and the tool results. `usage` is only
            // the last step, so bill the sum of every step. Sum `steps` rather than
            // read `totalUsage`: the two match when the turn ends normally, but when
            // a later step throws (a provider 5xx, a context-length 400) the SDK
            // still calls onFinish for the steps that finished and leaves
            // `totalUsage` empty, which would bill nothing.
            let inputTokens = 0;
            let outputTokens = 0;
            for (const stepUsage of steps?.length ? steps.map((s) => s.usage) : [usage]) {
              const u = stepUsage as
                | { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number }
                | undefined;
              inputTokens += u?.inputTokens ?? u?.promptTokens ?? 0;
              outputTokens += u?.outputTokens ?? u?.completionTokens ?? 0;
            }
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
                  // No upgrade advice while Pro is not on sale (payments.ts).
                  freeLimitGuidance("searches", "a day"),
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
                  freeLimitGuidance("cover letters", "a week"),
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
      getInboxThreads: {
        ...getInboxThreadsTool,
        execute: async (params: any, execOptions: any) => {
          return getInboxThreadsTool.execute!({ ...params, userId }, execOptions);
        },
      },
      getInboxThread: {
        ...getInboxThreadTool,
        execute: async (params: any, execOptions: any) => {
          return getInboxThreadTool.execute!({ ...params, userId }, execOptions);
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
