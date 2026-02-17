import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { users, jobs } from "@repo/db";
import { eq } from "drizzle-orm";

export const interviewPrepTool = tool({
  description:
    "Prepare the user for a job interview by providing company research, common interview questions, and STAR method coaching based on the specific job and user profile.",
  inputSchema: z.object({
    // userId is injected server-side by the orchestrator — not LLM-provided
    userId: z.string().optional(),
    jobId: z.number().describe("The job ID to prepare for"),
    focusArea: z
      .enum([
        "general",
        "technical",
        "behavioral",
        "company_research",
        "salary_negotiation",
      ])
      .optional()
      .describe("Which aspect of interview prep to focus on"),
  }),
  execute: async ({ userId, jobId, focusArea = "general" }) => {
    if (!userId) return { prepared: false, error: "Not authenticated" };

    // Get user profile
    const userResult = await db
      .select({
        name: users.name,
        headline: users.headline,
        skills: users.skills,
        experience: users.experience,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return { prepared: false, error: "User not found" };
    }

    const user = userResult[0]!;
    if (user.subscriptionStatus !== "active") {
      return {
        prepared: false,
        error: "Interview prep requires a Pro subscription.",
        requiresUpgrade: true,
      };
    }

    // Get job details
    const jobResult = await db
      .select({
        title: jobs.title,
        companyName: jobs.companyName,
        description: jobs.description,
        skills: jobs.skills,
        jobLevel: jobs.jobLevel,
        companyIndustry: jobs.companyIndustry,
        companyDescription: jobs.companyDescription,
        companyNumEmployees: jobs.companyNumEmployees,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (jobResult.length === 0) {
      return { prepared: false, error: "Job not found" };
    }

    const job = jobResult[0]!;
    const userSkills = (user.skills as string[]) ?? [];
    const jobSkills = (job.skills as string[]) ?? [];
    const matchingSkills = userSkills.filter((skill) =>
      jobSkills.some((js) => js.toLowerCase() === skill.toLowerCase())
    );
    const missingSkills = jobSkills.filter(
      (skill) =>
        !userSkills.some((us) => us.toLowerCase() === skill.toLowerCase())
    );

    return {
      prepared: true,
      focusArea,
      context: {
        userName: user.name,
        userHeadline: user.headline,
        userSkills,
        jobTitle: job.title,
        companyName: job.companyName,
        companyIndustry: job.companyIndustry,
        companyDescription: job.companyDescription?.slice(0, 1500),
        companySize: job.companyNumEmployees,
        jobDescription: job.description?.slice(0, 2000),
        jobLevel: job.jobLevel,
        jobSkills,
        matchingSkills,
        missingSkills,
      },
      instruction: `Using the context above, provide interview preparation tailored to the focus area "${focusArea}". Include:
- For "general": Overview of the company, role expectations, 5 likely questions, and tips
- For "technical": Technical questions based on job skills, coding challenge tips, system design topics
- For "behavioral": STAR method examples using the user's matching skills, common behavioral questions
- For "company_research": Company overview, recent news/products, culture insights, questions to ask
- For "salary_negotiation": Market rate context, negotiation strategies, questions about compensation

Highlight matching skills as strengths and missing skills as areas to prepare. Be specific and actionable.`,
    };
  },
});
