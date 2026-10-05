/**
 * Human labels for the orchestrator's tools, shown as status chips in the chat
 * ("Searching jobs" while running, "Searched jobs" when done) instead of raw
 * tool names like `searchJobs`.
 */
const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  searchJobs: { running: "Searching jobs", done: "Searched jobs" },
  updateFilters: { running: "Updating filters", done: "Updated filters" },
  favoriteJob: { running: "Saving job", done: "Saved job" },
  getJobDetails: { running: "Reading job details", done: "Read job details" },
  getUserProfile: { running: "Reading your profile", done: "Read your profile" },
  savePreferences: { running: "Saving preferences", done: "Saved preferences" },
  generateCoverLetter: { running: "Writing cover letter", done: "Wrote cover letter" },
  createAlert: { running: "Creating job alert", done: "Created job alert" },
  applyJob: { running: "Starting application", done: "Started application" },
  submitAnswers: { running: "Submitting answers", done: "Submitted answers" },
  interviewPrep: { running: "Preparing interview tips", done: "Prepared interview tips" },
  companyResearch: { running: "Researching company", done: "Researched company" },
  resumeBuilder: { running: "Building résumé", done: "Built résumé" },
  salaryInsights: { running: "Checking salaries", done: "Checked salaries" },
  marketInsights: { running: "Checking the job market", done: "Checked the job market" },
  updateApplicationStage: { running: "Updating application", done: "Updated application" },
  funnelAnalytics: { running: "Reviewing your pipeline", done: "Reviewed your pipeline" },
  followUpSuggestions: { running: "Finding follow-ups", done: "Found follow-ups" },
  recordFollowUp: { running: "Logging follow-up", done: "Logged follow-up" },
  getInboxThreads: { running: "Reading your inbox", done: "Read your inbox" },
  getInboxThread: { running: "Reading email", done: "Read email" },
  learnPreference: { running: "Noting your preference", done: "Noted your preference" },
  evaluateJob: { running: "Evaluating job", done: "Evaluated job" },
  draftCoverLetter: { running: "Drafting cover letter", done: "Drafted cover letter" },
  tailorResume: { running: "Tailoring résumé", done: "Tailored résumé" },
  negotiationBrief: { running: "Preparing negotiation brief", done: "Prepared negotiation brief" },
  companyDeepDive: { running: "Researching company", done: "Researched company" },
  draftOutreach: { running: "Drafting outreach", done: "Drafted outreach" },
  careerAdvisor: { running: "Reviewing your career", done: "Reviewed your career" },
  captureWritingStyle: { running: "Learning your writing style", done: "Learned your writing style" },
  prepInterview: { running: "Preparing interview", done: "Prepared interview" },
  batchEvaluate: { running: "Evaluating jobs", done: "Evaluated jobs" },
  applyCopilot: { running: "Preparing application", done: "Prepared application" },
};

/** "getUserProfile" → "Get user profile" (fallback for tools without a label). */
function humanize(toolName: string): string {
  const words = toolName.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type ToolChipState = "running" | "done" | "failed";

export function toolChipLabel(toolName: string, state: ToolChipState): string {
  const labels = TOOL_LABELS[toolName];
  if (state === "failed") return `${labels?.running ?? humanize(toolName)} failed`;
  if (!labels) return humanize(toolName);
  return state === "done" ? labels.done : labels.running;
}
