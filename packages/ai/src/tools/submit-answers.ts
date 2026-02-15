import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { applications, agentInstances } from "@repo/db";
import { eq, and } from "drizzle-orm";

export const submitAnswersTool = tool({
  description:
    "Submit pre-filled answers for a job application. The application agent uses this to record the user's responses to screening questions before they visit the apply URL. REQUIRES USER APPROVAL before executing.",
  inputSchema: z.object({
    userId: z.string().describe("The current user's ID"),
    applicationId: z
      .number()
      .describe("The application ID returned from applyJob"),
    answers: z
      .array(
        z.object({
          question: z.string().describe("The screening question text"),
          answer: z.string().describe("The user's answer to this question"),
        })
      )
      .min(1)
      .describe("Array of question/answer pairs for the application"),
    resumeUrl: z
      .string()
      .url()
      .optional()
      .describe("URL to the user's resume if available"),
    notes: z
      .string()
      .optional()
      .describe("Additional notes or context for the application"),
  }),
  execute: async ({ userId, applicationId, answers, resumeUrl, notes }) => {
    // Verify the application belongs to the user
    const appResult = await db
      .select({
        id: applications.id,
        agentInstanceId: applications.agentInstanceId,
        status: applications.status,
      })
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), eq(applications.userId, userId))
      )
      .limit(1);

    if (appResult.length === 0) {
      return { submitted: false, error: "Application not found" };
    }

    const application = appResult[0]!;

    if (application.status === "submitted") {
      return {
        submitted: false,
        error: "Application answers have already been submitted",
      };
    }

    // Update application with answers
    await db
      .update(applications)
      .set({
        answers: JSON.stringify(answers),
        resumeUrl: resumeUrl ?? null,
        notes: notes ?? null,
        status: "submitted",
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    // Update agent instance state
    if (application.agentInstanceId) {
      await db
        .update(agentInstances)
        .set({
          status: "completed",
          state: {
            step: "answers_submitted",
            answersCount: answers.length,
            hasResume: !!resumeUrl,
          },
          updatedAt: new Date(),
        })
        .where(eq(agentInstances.id, application.agentInstanceId));
    }

    return {
      submitted: true,
      applicationId,
      answersCount: answers.length,
      hasResume: !!resumeUrl,
      instruction:
        "The application answers have been saved. Let the user know their responses are ready and they can now visit the application URL to complete the process. Their answers can be copied and pasted into the application form.",
    };
  },
});
