import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { users, jobs, applications, agentInstances, userJobs } from "@repo/db";
import { eq, and } from "drizzle-orm";

export const applyJobTool = tool({
  description:
    "Initiate a job application for the user. This will open the job's application page and track the application. REQUIRES USER APPROVAL before executing.",
  inputSchema: z.object({
    userId: z.string().describe("The current user's ID"),
    jobId: z.number().describe("The job ID to apply for"),
    coverLetter: z
      .string()
      .max(10_000)
      .optional()
      .describe("Optional cover letter text to include"),
  }),
  execute: async ({ userId, jobId, coverLetter }) => {
    // Get user profile
    const userResult = await db
      .select({
        name: users.name,
        email: users.email,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return { applied: false, error: "User not found" };
    }

    const user = userResult[0]!;
    if (user.subscriptionStatus !== "active") {
      return {
        applied: false,
        error: "Job applications require a Pro subscription.",
        requiresUpgrade: true,
      };
    }

    // Get job details
    const jobResult = await db
      .select({
        title: jobs.title,
        companyName: jobs.companyName,
        jobUrl: jobs.jobUrl,
        applyUrl: jobs.applyUrl,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (jobResult.length === 0) {
      return { applied: false, error: "Job not found" };
    }

    const job = jobResult[0]!;
    const applicationUrl = job.applyUrl ?? job.jobUrl;

    if (!applicationUrl) {
      return { applied: false, error: "No application URL available for this job" };
    }

    // Check for duplicate applications — prevent creating multiple records
    const existingApp = await db
      .select({ id: applications.id, status: applications.status })
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)))
      .limit(1);

    if (existingApp.length > 0 && existingApp[0]!.status !== "failed") {
      return {
        applied: false,
        error: "You already have an active application for this job.",
        existingApplicationId: existingApp[0]!.id,
        applicationUrl,
      };
    }

    // Create agent instance, application record, and update userJobs
    // inside a transaction to prevent orphaned records on partial failure.
    const { agentId, applicationId } = await db.transaction(async (tx) => {
      // Create agent instance to track this application
      const agentResult = await tx
        .insert(agentInstances)
        .values({
          userId,
          agentType: "application",
          jobId,
          status: "running",
          state: { step: "initiated", coverLetter: coverLetter ?? null },
        })
        .returning({ id: agentInstances.id });

      const newAgentId = agentResult[0]?.id;

      // Create application record
      const appResult = await tx
        .insert(applications)
        .values({
          userId,
          jobId,
          agentInstanceId: newAgentId,
          status: "in_progress",
          coverLetter: coverLetter ?? null,
        })
        .returning({ id: applications.id });

      const newApplicationId = appResult[0]?.id;

      // Track in userJobs as "applied" (upsert: change existing favorited → applied)
      const existingUserJob = await tx
        .select({ id: userJobs.id })
        .from(userJobs)
        .where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)))
        .limit(1);

      if (existingUserJob.length > 0) {
        await tx
          .update(userJobs)
          .set({ status: "applied", appliedAt: new Date(), updatedAt: new Date() })
          .where(eq(userJobs.id, existingUserJob[0]!.id));
      } else {
        await tx.insert(userJobs).values({
          userId,
          jobId,
          status: "applied",
          appliedAt: new Date(),
        });
      }

      return { agentId: newAgentId, applicationId: newApplicationId };
    });

    return {
      applied: true,
      applicationId,
      agentInstanceId: agentId,
      jobTitle: job.title,
      companyName: job.companyName,
      applicationUrl,
      instruction:
        "The application has been initiated. Direct the user to open the application URL to complete their application. If a cover letter was provided, let them know it's ready to paste. Track the application status in the user's profile.",
    };
  },
});
