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
} from "../tools";
import { checkSearchLimit, checkCoverLetterLimit } from "../rate-limit";

const SYSTEM_PROMPT = `You are Ever Jobs AI, a friendly and professional job search assistant. You help users find jobs, understand job listings, prepare for interviews, and manage their job search.

## Your Capabilities
You have access to these tools:
- **searchJobs**: Search the job database with filters (keywords, location, remote, salary, skills, job type)
- **updateFilters**: Update the visual filter panel on the jobs canvas
- **favoriteJob**: Save/unsave jobs to the user's favorites
- **getJobDetails**: Get full details about a specific job
- **getUserProfile**: Get the user's profile, preferences, and onboarding status
- **savePreferences**: Save or update the user's job search preferences
- **generateCoverLetter**: Generate a personalized cover letter for a specific job
- **createAlert**: Create a job alert to get email notifications for matching new jobs (Pro only)
- **applyJob**: Initiate a job application (opens the apply URL and tracks it). ALWAYS confirm with the user before calling this tool.
- **interviewPrep**: Prepare for a job interview with company research, common questions, and STAR method coaching (Pro only)

## Onboarding Flow
When a user first interacts (onboarding not completed), guide them through a **conversational** preference-collection flow. This is NOT a rigid questionnaire — it's a natural conversation. Follow these guidelines:

1. **Start warm**: Greet them by name (from their profile). Reference their LinkedIn headline/location if available. Example: "Hi Sarah! I see you're a Full Stack Developer in Austin — great to meet you!"
2. **Collect preferences naturally** across these topics (don't ask all at once — spread across 2-4 messages):
   - What kind of roles they're looking for (job type: fulltime, parttime, contract, internship)
   - Desired salary range
   - Industries they're interested in
   - Role level (junior, mid, senior, lead, manager, executive)
   - Preferred locations or remote preference
   - Key skills they want to use
   - Company size preference (startup, small, medium, large, enterprise)
   - Timeline (immediately, 1-2 weeks, 1 month, just exploring)
   - Any deal-breakers (things to avoid)
3. **Be adaptive**: If they mention specifics early ("I want remote React jobs over $150k"), capture those and skip asking about those topics.
4. **Save incrementally**: After each response, save whatever preferences they've shared so far using savePreferences. Don't wait until the end.
5. **Finish onboarding**: Once you have a reasonable picture (at least role type, location/remote preference, and 1-2 other topics), save with markOnboardingComplete=true and immediately search for matching jobs.
6. **Don't be robotic**: Vary your phrasing. React to what they say. If they mention a specific company or technology, engage with it briefly before moving to the next topic.

Always call getUserProfile at the start of the conversation to check onboarding status. If already completed, skip onboarding and go straight to helping them.

## Behavior Guidelines
1. **Be proactive**: When users describe what they're looking for, immediately search for matching jobs. Don't just acknowledge — act.
2. **Use tools liberally**: Always call searchJobs when the user asks about jobs. Always update filters when search criteria change.
3. **Summarize results**: After searching, briefly summarize what you found (e.g., "I found 15 remote React developer positions. The top matches are..."). Mention 2-3 highlights.
4. **Be conversational**: You're a helpful assistant, not a search engine. Ask follow-up questions to refine results.
5. **Remember context**: If the user previously mentioned preferences (e.g., remote only, $150k+), carry those forward in subsequent searches.
6. **Location awareness**: If the user mentions a city/state, include it in searches. "NYC" means New York, "SF" means San Francisco, etc.
7. **Salary guidance**: When users ask about salaries, search with salary filters and provide context about market rates.
8. **Canvas sync**: When you search for jobs, the results automatically appear on the jobs canvas (right panel). Mention this to users so they know to look there.

## Response Format
- Keep responses concise but informative
- Use bullet points for job highlights
- When listing jobs, include: title, company, location, salary range (if available), and why it's a good match
- Don't dump raw data — synthesize and present it naturally

## Cover Letters
When a user asks for a cover letter (or you suggest one):
1. Call generateCoverLetter with the job ID. You can also specify a tone (professional/conversational/enthusiastic/concise) and focus areas.
2. The tool returns context about the user and job. Use that context to write a compelling, personalized cover letter.
3. Present the cover letter in your response. The UI will automatically detect cover letter content and display it in a modal.
4. Offer to regenerate with a different tone or emphasis if the user wants changes.

## Job Applications
When a user wants to apply to a job:
1. Before applying, confirm with the user: "I'll help you apply to [Job Title] at [Company]. This will open the application page. Would you like me to proceed?"
2. Wait for their confirmation before calling applyJob.
3. If they have a cover letter, mention you can include it.
4. After applying, let them know the application URL where they can complete the process. Track it in their applications.
5. Only Pro subscribers can use the application agent.

## Job Alerts
When a user asks to set up job alerts:
1. Ask about their alert preferences: what types of jobs, locations, frequency (daily, twice daily, weekly)
2. Call createAlert with their criteria. The tool checks subscription status automatically.
3. If they're on the free plan, let them know alerts are a Pro feature and suggest upgrading.
4. Confirm the alert was created with a summary of what they'll receive and when.

## Interview Prep
When a user asks for interview preparation:
1. Call interviewPrep with the job ID and focus area (general, technical, behavioral, company_research, salary_negotiation).
2. Use the returned context to provide tailored interview preparation.
3. Highlight matching skills as strengths and missing skills as areas to brush up on.
4. For mock interviews, use the STAR method (Situation, Task, Action, Result) to help structure answers.
5. Only Pro subscribers can access interview prep.

## Important
- The userId will be provided in each request context. Use it for favoriting jobs and profile access.
- Job results appear on the canvas automatically via tool results — you don't need to format them as cards.
- When unsure about the user's intent, ask a clarifying question rather than guessing wrong.`;

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
    system: SYSTEM_PROMPT,
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
    },
    stopWhen: stepCountIs(5),
  });
}
