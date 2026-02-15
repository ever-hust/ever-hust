import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { users, jobs } from "@repo/db";
import { eq } from "drizzle-orm";

export const generateCoverLetterTool = tool({
  description:
    "Generate a personalized cover letter for a specific job using the user's profile. Returns the cover letter text and job details.",
  inputSchema: z.object({
    userId: z.string().describe("The current user's ID"),
    jobId: z
      .number()
      .describe("The job ID to generate the cover letter for"),
    tone: z
      .enum(["professional", "conversational", "enthusiastic", "concise"])
      .optional()
      .describe(
        "Tone of the cover letter. Defaults to professional."
      ),
    focusAreas: z
      .array(z.string())
      .optional()
      .describe(
        "Specific skills or experiences to emphasize in the cover letter"
      ),
  }),
  execute: async ({ userId, jobId, tone = "professional", focusAreas }) => {
    // Get user profile
    const userResult = await db
      .select({
        name: users.name,
        email: users.email,
        headline: users.headline,
        location: users.location,
        skills: users.skills,
        preferences: users.preferences,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return { error: "User not found", generated: false };
    }

    // Get job details
    const jobResult = await db
      .select({
        title: jobs.title,
        companyName: jobs.companyName,
        description: jobs.description,
        skills: jobs.skills,
        location: jobs.locationCity,
        isRemote: jobs.isRemote,
        jobLevel: jobs.jobLevel,
        companyIndustry: jobs.companyIndustry,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (jobResult.length === 0) {
      return { error: "Job not found", generated: false };
    }

    const user = userResult[0]!;
    const job = jobResult[0]!;
    const userSkills = (user.skills as string[]) ?? [];

    // Find overlapping skills between user and job
    const jobSkills = (job.skills as string[]) ?? [];
    const matchingSkills = userSkills.filter((skill) =>
      jobSkills.some(
        (js) => js.toLowerCase() === skill.toLowerCase()
      )
    );

    // Return context for the AI to generate the letter
    // The orchestrator will use this context + its language model to write the actual letter
    return {
      generated: true,
      jobId,
      context: {
        userName: user.name,
        userEmail: user.email,
        userHeadline: user.headline,
        userLocation: user.location,
        userSkills,
        jobTitle: job.title,
        companyName: job.companyName,
        jobDescription: job.description?.slice(0, 2000),
        jobSkills,
        matchingSkills,
        jobLocation: job.location,
        isRemote: job.isRemote,
        jobLevel: job.jobLevel,
        companyIndustry: job.companyIndustry,
        tone,
        focusAreas: focusAreas ?? [],
      },
      instruction:
        "Using the context above, write a compelling cover letter. The letter should highlight the matching skills, reference specific aspects of the job description, and be written in the requested tone. Format it as a professional letter with proper paragraphs. Do NOT include placeholders - use the actual data provided. Return the cover letter text in your response.",
    };
  },
});
