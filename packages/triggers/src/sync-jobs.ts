import { task, schedules } from "@trigger.dev/sdk/v3";
import { db, jobs } from "@repo/db";
import { everJobsClient, type JobPostDto } from "@repo/jobs-api";
import { eq } from "drizzle-orm";

const SEARCH_TERMS = [
  // Engineering
  "software engineer",
  "frontend developer",
  "backend developer",
  "full stack developer",
  "mobile developer",
  "devops engineer",
  "site reliability engineer",
  "platform engineer",
  "cloud engineer",
  "security engineer",
  "embedded engineer",
  "QA engineer",
  // Data & AI
  "data scientist",
  "data engineer",
  "machine learning engineer",
  "AI engineer",
  "data analyst",
  "business intelligence analyst",
  // Product & Design
  "product manager",
  "product designer",
  "UX designer",
  "UI designer",
  "UX researcher",
  "graphic designer",
  // Leadership
  "engineering manager",
  "VP of engineering",
  "CTO",
  "technical lead",
  "director of product",
  // Business & Operations
  "marketing manager",
  "sales engineer",
  "solutions architect",
  "technical writer",
  "project manager",
  "scrum master",
  // Emerging
  "blockchain developer",
  "web3 engineer",
  "AR/VR developer",
  "robotics engineer",
  "computer vision engineer",
];

/**
 * Map an API JobPostDto to our DB jobs schema.
 */
function mapJobToDb(dto: JobPostDto) {
  return {
    externalId: dto.id,
    site: dto.site,
    title: dto.title,
    companyName: dto.companyName ?? null,
    companyUrl: dto.companyUrl ?? null,
    companyLogo: dto.companyLogo ?? null,
    jobUrl: dto.jobUrl ?? null,
    jobUrlDirect: dto.jobUrlDirect ?? null,
    applyUrl: dto.applyUrl ?? null,
    locationCity: dto.location?.city ?? null,
    locationState: dto.location?.state ?? null,
    locationCountry: dto.location?.country ?? null,
    isRemote: dto.isRemote ?? false,
    jobType: dto.jobType ?? [],
    salaryMin: dto.compensation?.minAmount?.toString() ?? null,
    salaryMax: dto.compensation?.maxAmount?.toString() ?? null,
    salaryCurrency: dto.compensation?.currency ?? null,
    salaryInterval: dto.compensation?.interval ?? null,
    description: dto.description ?? null,
    skills: dto.skills ?? [],
    department: dto.department ?? null,
    team: dto.team ?? null,
    employmentType: dto.employmentType ?? null,
    jobLevel: dto.jobLevel ?? null,
    jobFunction: dto.jobFunction ?? null,
    companyIndustry: dto.companyIndustry ?? null,
    companyNumEmployees: dto.companyNumEmployees ?? null,
    companyDescription: dto.companyDescription ?? null,
    datePosted: dto.datePosted ? new Date(dto.datePosted) : null,
    rawData: dto as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  };
}

async function syncJobs() {
  // Rotate through search terms
  const termIndex = Math.floor(Date.now() / (15 * 60 * 1000)) % SEARCH_TERMS.length;
  const searchTerm = SEARCH_TERMS[termIndex]!;

  let totalUpserted = 0;

  try {
    const response = await everJobsClient.searchJobs(
      {
        searchTerm,
        resultsWanted: 50,
        descriptionFormat: "markdown",
      },
      { pageSize: 50 }
    );

    for (const dto of response.jobs) {
      try {
        // Check if job exists
        const existing = await db
          .select({ id: jobs.id })
          .from(jobs)
          .where(eq(jobs.externalId, dto.id))
          .limit(1);

        const mapped = mapJobToDb(dto);

        if (existing.length > 0) {
          // Update existing
          await db
            .update(jobs)
            .set(mapped)
            .where(eq(jobs.externalId, dto.id));
        } else {
          // Insert new
          await db.insert(jobs).values({
            ...mapped,
            createdAt: new Date(),
          });
        }

        totalUpserted++;
      } catch (error) {
        console.error(
          `Failed to upsert job ${dto.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  } catch (error) {
    console.error(
      `Failed to sync jobs for "${searchTerm}":`,
      error instanceof Error ? error.message : error
    );
  }

  return { searchTerm, totalUpserted };
}

export const syncJobsTask = task({
  id: "sync-jobs",
  run: async () => {
    return syncJobs();
  },
});

// Run every 15 minutes
export const syncJobsSchedule = schedules.task({
  id: "sync-jobs-schedule",
  cron: "*/15 * * * *",
  run: async () => {
    return syncJobs();
  },
});
