import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { applications, agentInstances, users } from "@repo/db";
import { eq, and } from "drizzle-orm";

export const submitAnswersTool = tool({
  description:
    "Submit the user's answers to application questions. This updates the application record with the answers provided. REQUIRES USER APPROVAL before executing. Only available to Pro subscribers.",
  inputSchema: z.object({
    userId: z.string().describe("The current user's ID"),
    applicationId: z
      .number()
      .describe("The application ID to submit answers for"),
    answers: z
      .array(
        z.object({
          questionId: z.string().max(100).describe("The question identifier"),
          answer: z.string().max(5000).describe("The user's answer to the question"),
        })
      )
      .max(50)
      .describe("Array of question-answer pairs"),
  }),
  execute: async ({ userId, applicationId, answers }) => {
    // Check subscription — submitting answers is a Pro feature
    const userResult = await db
      .select({ subscriptionStatus: users.subscriptionStatus })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return { submitted: false, error: "User not found" };
    }

    if (userResult[0]!.subscriptionStatus !== "active") {
      return {
        submitted: false,
        error: "Submitting application answers requires a Pro subscription.",
        requiresUpgrade: true,
      };
    }

    // Verify the application belongs to the user
    const appResult = await db
      .select({
        id: applications.id,
        status: applications.status,
        agentInstanceId: applications.agentInstanceId,
        questionsAsked: applications.questionsAsked,
      })
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), eq(applications.userId, userId))
      )
      .limit(1);

    if (appResult.length === 0) {
      return {
        submitted: false,
        error: "Application not found or does not belong to this user.",
      };
    }

    const app = appResult[0]!;

    if (app.status === "submitted") {
      return {
        submitted: false,
        error: "This application has already been submitted.",
      };
    }

    if (app.status === "failed") {
      return {
        submitted: false,
        error:
          "This application previously failed. Please start a new application.",
      };
    }

    // Validate that all required questions have answers
    const questions = app.questionsAsked as
      | {
          question: string;
          fieldType: string;
          required: boolean;
          options: string[] | null;
        }[]
      | null;

    if (questions && questions.length > 0) {
      const answeredIds = new Set(answers.map((a) => a.questionId));
      const unanswered = questions.filter(
        (q, i) => q.required && !answeredIds.has(String(i))
      );
      if (unanswered.length > 0) {
        return {
          submitted: false,
          error: `Missing answers for required questions: ${unanswered.map((q) => q.question).join(", ")}`,
          missingQuestions: unanswered,
        };
      }
    }

    // Update the application with answers and mark as submitted
    await db
      .update(applications)
      .set({
        answersProvided: answers,
        status: "submitted",
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    // Update agent instance status if linked
    if (app.agentInstanceId) {
      await db
        .update(agentInstances)
        .set({
          status: "completed",
          state: {
            step: "answers_submitted",
            answersCount: answers.length,
            submittedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(agentInstances.id, app.agentInstanceId));
    }

    return {
      submitted: true,
      applicationId,
      answersCount: answers.length,
      instruction:
        "The answers have been submitted successfully. Let the user know their application answers have been saved and the application status is now 'submitted'. If there's an external application URL, remind them to complete the process there.",
    };
  },
});
