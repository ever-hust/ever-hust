/**
 * Guidance topics the AI can naturally explore during conversations.
 *
 * These topics help the orchestrator provide proactive career guidance
 * beyond just searching for jobs — making the AI feel like a true
 * career advisor rather than a search engine.
 */

export interface GuidanceTopic {
  id: string;
  title: string;
  triggers: string[];
  response_guidance: string;
}

export const GUIDANCE_TOPICS: GuidanceTopic[] = [
  {
    id: "salary_negotiation",
    title: "Salary Negotiation",
    triggers: [
      "salary",
      "compensation",
      "negotiate",
      "pay",
      "raise",
      "offer",
      "counter",
      "benefits",
      "equity",
    ],
    response_guidance:
      "Provide data-driven salary guidance. Reference market rates from search results. " +
      "Suggest negotiation strategies: research the range, anchor high, emphasize total comp, " +
      "consider equity/benefits, and never accept the first offer without discussion.",
  },
  {
    id: "resume_optimization",
    title: "Resume Optimization",
    triggers: [
      "resume",
      "cv",
      "experience",
      "tailor",
      "keywords",
      "ATS",
      "optimize",
    ],
    response_guidance:
      "Help users tailor their resume for specific roles. Focus on: matching keywords from job " +
      "descriptions, quantifying achievements (numbers, percentages, dollar amounts), using " +
      "strong action verbs, and keeping it concise (1-2 pages). Mention ATS optimization.",
  },
  {
    id: "career_transition",
    title: "Career Transition",
    triggers: [
      "career change",
      "transition",
      "switch",
      "pivot",
      "different field",
      "new career",
      "change direction",
    ],
    response_guidance:
      "Be supportive of career changes. Help identify transferable skills. Suggest bridge roles " +
      "that leverage existing experience while moving toward the new field. Recommend courses, " +
      "certifications, or side projects that can build credibility in the new area.",
  },
  {
    id: "interview_tips",
    title: "Interview Tips",
    triggers: [
      "interview",
      "prepare",
      "questions",
      "behavioral",
      "technical",
      "whiteboard",
      "coding challenge",
      "culture fit",
    ],
    response_guidance:
      "Provide structured interview prep. Cover: company research, STAR method for behavioral " +
      "questions, common technical patterns, questions to ask the interviewer, and logistics " +
      "(arrive early, dress code, follow-up thank you notes).",
  },
  {
    id: "remote_work",
    title: "Remote Work",
    triggers: [
      "remote",
      "work from home",
      "WFH",
      "hybrid",
      "distributed",
      "digital nomad",
      "timezone",
    ],
    response_guidance:
      "Help users navigate remote work opportunities. Discuss: timezone considerations, " +
      "remote-first vs remote-friendly companies, home office setup, async communication " +
      "skills, and how to stand out as a remote candidate.",
  },
  {
    id: "networking",
    title: "Networking",
    triggers: [
      "network",
      "connect",
      "LinkedIn",
      "referral",
      "cold outreach",
      "informational interview",
      "meetup",
    ],
    response_guidance:
      "Encourage strategic networking. Suggest: LinkedIn optimization, informational " +
      "interviews (20-30 min chats with people in target roles), attending relevant meetups " +
      "or conferences, and the warm intro approach for referrals.",
  },
  {
    id: "skill_gap",
    title: "Skill Gap Analysis",
    triggers: [
      "learn",
      "skill",
      "course",
      "certification",
      "bootcamp",
      "upskill",
      "gap",
      "missing",
      "qualify",
    ],
    response_guidance:
      "Help identify skill gaps by comparing the user's profile with job requirements. " +
      "Suggest specific, actionable learning paths: online courses, certifications, " +
      "open source contributions, or side projects. Prioritize high-impact skills " +
      "that appear frequently in target job listings.",
  },
  {
    id: "job_market_trends",
    title: "Job Market Trends",
    triggers: [
      "market",
      "trend",
      "demand",
      "growing",
      "declining",
      "hot",
      "in-demand",
      "outlook",
      "future",
    ],
    response_guidance:
      "Share insights about market trends based on search results. Discuss which roles " +
      "have high demand, emerging technologies, and industries showing growth. " +
      "Be data-driven when possible — reference the number of listings found.",
  },
];

/**
 * Find relevant guidance topics based on a user's message.
 * Returns topics whose trigger words match the input.
 */
export function findRelevantTopics(message: string): GuidanceTopic[] {
  const lower = message.toLowerCase();
  return GUIDANCE_TOPICS.filter((topic) =>
    topic.triggers.some((trigger) => lower.includes(trigger.toLowerCase()))
  );
}
