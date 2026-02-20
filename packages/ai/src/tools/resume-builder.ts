import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { eq } from "drizzle-orm";
import {
  extractAtsKeywords,
  findSkillOverlap,
  getFormatTips,
} from "./resume-helpers";

export const resumeBuilderTool = tool({
  description:
    "Generate ATS-optimized resume content and guidance tailored to a specific job. Provides structured data including keywords, skills analysis, and formatting tips that the assistant uses to help the user build their resume. Use when the user asks for help with their resume, CV, or wants to tailor their resume for a specific job.",
  inputSchema: z.object({
    targetJobTitle: z
      .string()
      .describe("The job title the user is targeting for their resume"),
    targetJobId: z
      .number()
      .optional()
      .describe(
        "Optional job ID to pull specific requirements from a job listing in the database"
      ),
    userSummary: z
      .string()
      .optional()
      .describe(
        "Optional summary of the user's professional experience and background"
      ),
    skills: z
      .array(z.string())
      .optional()
      .describe("Optional list of the user's skills"),
    experience: z
      .array(z.string())
      .optional()
      .describe(
        "Optional list of the user's past roles (e.g. 'Software Engineer at Google, 2020-2023')"
      ),
  }),
  execute: async ({
    targetJobTitle,
    targetJobId,
    userSummary,
    skills,
    experience,
  }) => {
    try {
      let targetJob: {
        title: string;
        company: string | null;
        skills: string[];
        level: string | null;
        descriptionSnippet: string | null;
        department: string | null;
        jobFunction: string | null;
      } | null = null;

      let atsKeywords: string[] = [];
      let jobSkills: string[] = [];

      // If a specific job ID is provided, fetch it from the database
      if (targetJobId !== undefined) {
        const jobResult = await db
          .select({
            title: jobs.title,
            companyName: jobs.companyName,
            description: jobs.description,
            skills: jobs.skills,
            jobLevel: jobs.jobLevel,
            department: jobs.department,
            jobFunction: jobs.jobFunction,
          })
          .from(jobs)
          .where(eq(jobs.id, targetJobId))
          .limit(1);

        if (jobResult.length > 0) {
          const job = jobResult[0]!;
          jobSkills = (job.skills as string[]) ?? [];

          targetJob = {
            title: job.title,
            company: job.companyName,
            skills: jobSkills,
            level: job.jobLevel,
            descriptionSnippet: job.description?.slice(0, 2000) ?? null,
            department: job.department,
            jobFunction: job.jobFunction,
          };

          // Extract ATS keywords from the job description
          if (job.description) {
            atsKeywords = extractAtsKeywords(job.description);
          }

          // Also add job skills as ATS keywords (they are prime keyword targets)
          for (const skill of jobSkills) {
            if (!atsKeywords.includes(skill)) {
              atsKeywords.push(skill);
            }
          }
        }
      }

      // Analyze skill overlap between user and job
      const userSkills = skills ?? [];
      const {
        matching: suggestedSkillsToHighlight,
        missing: skillGaps,
      } = findSkillOverlap(userSkills, jobSkills);

      // Generate formatting tips based on job level
      const formatTips = getFormatTips(targetJob?.level ?? null);

      // Build the summary prompt guidance for the LLM
      const summaryParts: string[] = [];
      summaryParts.push(
        `Write a professional summary for a "${targetJobTitle}" position.`
      );
      if (targetJob?.company) {
        summaryParts.push(`The target company is ${targetJob.company}.`);
      }
      if (targetJob?.level) {
        summaryParts.push(`This is a ${targetJob.level} level position.`);
      }
      if (userSummary) {
        summaryParts.push(
          `The user describes their background as: "${userSummary}".`
        );
      }
      if (suggestedSkillsToHighlight.length > 0) {
        summaryParts.push(
          `Highlight these matching skills: ${suggestedSkillsToHighlight.join(", ")}.`
        );
      }
      if (atsKeywords.length > 0) {
        summaryParts.push(
          `Naturally incorporate these ATS keywords where relevant: ${atsKeywords.slice(0, 15).join(", ")}.`
        );
      }
      summaryParts.push(
        "Keep the summary to 3-4 sentences. Use strong action-oriented language."
      );

      // Build experience guidance
      const experienceParts: string[] = [];
      experienceParts.push(
        "Format each role with: Job Title | Company Name | Date Range."
      );
      experienceParts.push(
        "Under each role, write 3-5 bullet points starting with action verbs."
      );
      experienceParts.push(
        "Include quantifiable results (metrics, percentages, dollar amounts) wherever possible."
      );
      if (experience && experience.length > 0) {
        experienceParts.push(
          `The user's past roles include: ${experience.join("; ")}.`
        );
      }
      if (targetJob?.descriptionSnippet) {
        experienceParts.push(
          "Align bullet points with the requirements from the target job description."
        );
      }
      if (skillGaps.length > 0) {
        experienceParts.push(
          `The user is missing these job-required skills: ${skillGaps.join(", ")}. ` +
            "Suggest ways to demonstrate transferable experience for these areas."
        );
      }

      // Build the skills list to present — matching skills first, then remaining user skills
      const skillsToList: string[] = [...suggestedSkillsToHighlight];
      for (const skill of userSkills) {
        if (
          !skillsToList.some(
            (s) => s.toLowerCase() === skill.toLowerCase()
          )
        ) {
          skillsToList.push(skill);
        }
      }

      return {
        targetJob,
        atsKeywords: atsKeywords.slice(0, 30),
        suggestedSkillsToHighlight,
        skillGaps,
        formatTips,
        sections: {
          summaryPrompt: summaryParts.join(" "),
          skillsToList,
          experienceGuidance: experienceParts.join(" "),
        },
      };
    } catch (err) {
      console.error(
        "[resume-builder] execute failed:",
        err instanceof Error ? err.message : err
      );
      return {
        error:
          "Something went wrong while generating resume guidance. Please try again.",
        targetJobTitle,
      };
    }
  },
});
