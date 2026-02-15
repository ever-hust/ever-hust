import { db } from "./client";
import { jobs } from "./schema/jobs";

async function seed() {
  console.log("Seeding database...");

  // Insert sample jobs
  await db.insert(jobs).values([
    {
      externalId: "li-sample-001",
      site: "linkedin",
      title: "Senior Full Stack Engineer",
      companyName: "TechCorp",
      companyLogo: null,
      jobUrl: "https://linkedin.com/jobs/view/sample-001",
      locationCity: "San Francisco",
      locationState: "CA",
      locationCountry: "USA",
      isRemote: true,
      jobType: ["fulltime"],
      description:
        "We are looking for a Senior Full Stack Engineer to join our team...",
      skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
      salaryMin: "150000",
      salaryMax: "220000",
      salaryCurrency: "USD",
      salaryInterval: "yearly",
      datePosted: new Date("2026-02-10"),
    },
    {
      externalId: "li-sample-002",
      site: "linkedin",
      title: "AI/ML Engineer",
      companyName: "AI Startup Inc",
      companyLogo: null,
      jobUrl: "https://linkedin.com/jobs/view/sample-002",
      locationCity: "New York",
      locationState: "NY",
      locationCountry: "USA",
      isRemote: false,
      jobType: ["fulltime"],
      description: "Join our AI team building next-generation ML models...",
      skills: ["Python", "PyTorch", "LLMs", "RAG"],
      salaryMin: "180000",
      salaryMax: "260000",
      salaryCurrency: "USD",
      salaryInterval: "yearly",
      datePosted: new Date("2026-02-12"),
    },
    {
      externalId: "indeed-sample-003",
      site: "indeed",
      title: "Frontend Developer (React)",
      companyName: "DesignHub",
      companyLogo: null,
      jobUrl: "https://indeed.com/jobs/view/sample-003",
      locationCity: "Austin",
      locationState: "TX",
      locationCountry: "USA",
      isRemote: true,
      jobType: ["fulltime", "contract"],
      description:
        "Looking for a talented React developer to build beautiful UIs...",
      skills: ["React", "TypeScript", "Tailwind CSS", "Next.js"],
      salaryMin: "120000",
      salaryMax: "170000",
      salaryCurrency: "USD",
      salaryInterval: "yearly",
      datePosted: new Date("2026-02-13"),
    },
  ]).onConflictDoNothing();

  console.log("Seed completed successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
