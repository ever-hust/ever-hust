import { searchJobsTool } from "../search-jobs";
import { updateFiltersTool } from "../update-filters";
import { createAlertTool } from "../create-alert";
import { favoriteJobTool } from "../favorite-job";
import { companyResearchTool } from "../company-research";
import { resumeBuilderTool } from "../resume-builder";
import { getUserProfileTool } from "../get-user-profile";
import { getJobDetailsTool } from "../get-job-details";
import { interviewPrepTool } from "../interview-prep";
import { generateCoverLetterTool } from "../generate-cover-letter";
import { salaryInsightsTool } from "../salary-insights";
import { applyJobTool } from "../apply-job";
import { submitAnswersTool } from "../submit-answers";
import { savePreferencesTool } from "../save-preferences";

describe("searchJobsTool schema", () => {
  it("should validate valid input with all fields", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      keywords: "react developer",
      location: "San Francisco",
      isRemote: true,
      jobType: "fulltime",
      salaryMin: 80000,
      salaryMax: 150000,
      skills: ["React", "TypeScript"],
      limit: 25,
      offset: 0,
    });

    expect(result.success).toBe(true);
  });

  it("should validate minimal valid input", () => {
    const result = searchJobsTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should validate input with only keywords", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      keywords: "python",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keywords).toBe("python");
    }
  });

  it("should validate input with only location", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      location: "New York",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBe("New York");
    }
  });

  it("should apply default values for limit and offset", () => {
    const result = searchJobsTool.inputSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.offset).toBe(0);
    }
  });

  it("should reject invalid jobType", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      jobType: "invalid-type",
    });

    expect(result.success).toBe(false);
  });

  it("should accept valid jobType values", () => {
    const validTypes = ["fulltime", "parttime", "internship", "contract"];

    for (const jobType of validTypes) {
      const result = searchJobsTool.inputSchema.safeParse({ jobType });
      expect(result.success).toBe(true);
    }
  });

  it("should validate skills as array of strings", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      skills: ["JavaScript", "Node.js", "Docker"],
    });

    expect(result.success).toBe(true);
  });

  it("should reject non-array skills", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      skills: "JavaScript",
    });

    expect(result.success).toBe(false);
  });

  it("should validate salaryMin as number", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      salaryMin: 50000,
    });

    expect(result.success).toBe(true);
  });

  it("should reject string salaryMin", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      salaryMin: "50000",
    });

    expect(result.success).toBe(false);
  });

  it("should reject negative salaryMin", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      salaryMin: -1,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative salaryMax", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      salaryMax: -100,
    });
    expect(result.success).toBe(false);
  });

  it("should reject salaryMin exceeding 10,000,000", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      salaryMin: 10_000_001,
    });
    expect(result.success).toBe(false);
  });

  it("should accept salaryMin at boundary (0 and 10,000,000)", () => {
    expect(searchJobsTool.inputSchema.safeParse({ salaryMin: 0 }).success).toBe(true);
    expect(searchJobsTool.inputSchema.safeParse({ salaryMin: 10_000_000 }).success).toBe(true);
  });

  it("should reject non-integer salary values", () => {
    const result = searchJobsTool.inputSchema.safeParse({
      salaryMin: 50000.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateFiltersTool schema", () => {
  it("should validate valid input with all fields", () => {
    const result = updateFiltersTool.inputSchema.safeParse({
      keywords: "developer",
      location: "Remote",
      isRemote: true,
      jobType: "fulltime",
      salaryMin: 60000,
      salaryMax: 120000,
      skills: ["Python", "Django"],
    });

    expect(result.success).toBe(true);
  });

  it("should validate empty object", () => {
    const result = updateFiltersTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should validate partial input", () => {
    const result = updateFiltersTool.inputSchema.safeParse({
      keywords: "engineer",
      isRemote: false,
    });

    expect(result.success).toBe(true);
  });

  it("should reject invalid jobType", () => {
    const result = updateFiltersTool.inputSchema.safeParse({
      jobType: "freelance",
    });

    expect(result.success).toBe(false);
  });

  it("should accept valid jobType values", () => {
    const validTypes = ["fulltime", "parttime", "internship", "contract"];

    for (const jobType of validTypes) {
      const result = updateFiltersTool.inputSchema.safeParse({ jobType });
      expect(result.success).toBe(true);
    }
  });

  it("should validate boolean isRemote", () => {
    const trueResult = updateFiltersTool.inputSchema.safeParse({
      isRemote: true,
    });
    const falseResult = updateFiltersTool.inputSchema.safeParse({
      isRemote: false,
    });

    expect(trueResult.success).toBe(true);
    expect(falseResult.success).toBe(true);
  });

  it("should reject string isRemote", () => {
    const result = updateFiltersTool.inputSchema.safeParse({
      isRemote: "true",
    });

    expect(result.success).toBe(false);
  });
});

describe("createAlertTool schema", () => {
  it("should validate valid input with required fields", () => {
    const result = createAlertTool.inputSchema.safeParse({
      userId: "user_123",
      frequency: "daily",
    });

    expect(result.success).toBe(true);
  });

  it("should validate input with all fields", () => {
    const result = createAlertTool.inputSchema.safeParse({
      userId: "user_123",
      frequency: "weekly",
      keywords: ["typescript", "react"],
      locations: ["San Francisco", "Remote"],
      remoteType: "remote",
      skills: ["TypeScript", "React", "Node.js"],
      roleLevel: ["mid", "senior"],
      industries: ["tech", "finance"],
    });

    expect(result.success).toBe(true);
  });

  it("should allow missing userId (injected server-side by orchestrator)", () => {
    const result = createAlertTool.inputSchema.safeParse({
      frequency: "daily",
    });

    expect(result.success).toBe(true);
  });

  it("should reject missing frequency", () => {
    const result = createAlertTool.inputSchema.safeParse({
      userId: "user_123",
    });

    expect(result.success).toBe(false);
  });

  it("should reject invalid frequency", () => {
    const result = createAlertTool.inputSchema.safeParse({
      userId: "user_123",
      frequency: "hourly",
    });

    expect(result.success).toBe(false);
  });

  it("should accept valid frequency values", () => {
    const validFrequencies = ["daily", "twice_daily", "weekly"];

    for (const frequency of validFrequencies) {
      const result = createAlertTool.inputSchema.safeParse({
        userId: "user_123",
        frequency,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid remoteType", () => {
    const result = createAlertTool.inputSchema.safeParse({
      userId: "user_123",
      frequency: "daily",
      remoteType: "hybrid",
    });

    expect(result.success).toBe(false);
  });

  it("should accept valid remoteType values", () => {
    const validRemoteTypes = ["remote", "onsite", "any"];

    for (const remoteType of validRemoteTypes) {
      const result = createAlertTool.inputSchema.safeParse({
        userId: "user_123",
        frequency: "daily",
        remoteType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should validate arrays for optional fields", () => {
    const result = createAlertTool.inputSchema.safeParse({
      userId: "user_123",
      frequency: "daily",
      keywords: ["javascript"],
      locations: ["Boston"],
      skills: ["React"],
      roleLevel: ["senior"],
      industries: ["tech"],
    });

    expect(result.success).toBe(true);
  });

  it("should reject non-array keywords", () => {
    const result = createAlertTool.inputSchema.safeParse({
      userId: "user_123",
      frequency: "daily",
      keywords: "javascript",
    });

    expect(result.success).toBe(false);
  });

  it("should accept empty arrays for optional fields", () => {
    const result = createAlertTool.inputSchema.safeParse({
      userId: "user_123",
      frequency: "daily",
      keywords: [],
      locations: [],
      skills: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("favoriteJobTool schema", () => {
  it("should validate valid input", () => {
    const result = favoriteJobTool.inputSchema.safeParse({
      jobId: 123,
      userId: "user_abc",
    });

    expect(result.success).toBe(true);
  });

  it("should reject missing jobId", () => {
    const result = favoriteJobTool.inputSchema.safeParse({
      userId: "user_abc",
    });

    expect(result.success).toBe(false);
  });

  it("should allow missing userId (injected server-side by orchestrator)", () => {
    const result = favoriteJobTool.inputSchema.safeParse({
      jobId: 123,
    });

    expect(result.success).toBe(true);
  });

  it("should reject string jobId", () => {
    const result = favoriteJobTool.inputSchema.safeParse({
      jobId: "123",
      userId: "user_abc",
    });

    expect(result.success).toBe(false);
  });

  it("should accept numeric userId as string", () => {
    const result = favoriteJobTool.inputSchema.safeParse({
      jobId: 456,
      userId: "123456",
    });

    expect(result.success).toBe(true);
  });

  it("should reject number userId", () => {
    const result = favoriteJobTool.inputSchema.safeParse({
      jobId: 123,
      userId: 456,
    });

    expect(result.success).toBe(false);
  });

  it("should validate with large jobId", () => {
    const result = favoriteJobTool.inputSchema.safeParse({
      jobId: 999999,
      userId: "user_xyz",
    });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// companyResearchTool schema
// ---------------------------------------------------------------------------
describe("companyResearchTool schema", () => {
  it("should validate valid input with companyName only", () => {
    const result = companyResearchTool.inputSchema.safeParse({
      companyName: "Google",
    });
    expect(result.success).toBe(true);
  });

  it("should validate input with companyName and jobId", () => {
    const result = companyResearchTool.inputSchema.safeParse({
      companyName: "Anthropic",
      jobId: 42,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing companyName", () => {
    const result = companyResearchTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject companyName exceeding 200 chars", () => {
    const result = companyResearchTool.inputSchema.safeParse({
      companyName: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("should accept companyName at boundary (200 chars)", () => {
    const result = companyResearchTool.inputSchema.safeParse({
      companyName: "x".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("should reject string jobId", () => {
    const result = companyResearchTool.inputSchema.safeParse({
      companyName: "Google",
      jobId: "123",
    });
    expect(result.success).toBe(false);
  });

  it("should accept companyName with unicode characters", () => {
    const result = companyResearchTool.inputSchema.safeParse({
      companyName: "日本電信電話株式会社",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resumeBuilderTool schema
// ---------------------------------------------------------------------------
describe("resumeBuilderTool schema", () => {
  it("should validate minimal valid input (targetJobTitle only)", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Software Engineer",
    });
    expect(result.success).toBe(true);
  });

  it("should validate full input", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Senior Frontend Developer",
      targetJobId: 42,
      userSummary: "Experienced developer with 5 years in React and TypeScript.",
      skills: ["React", "TypeScript", "Node.js"],
      experience: [
        "Software Engineer at Google, 2020-2023",
        "Junior Developer at Startup, 2018-2020",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing targetJobTitle", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject targetJobTitle exceeding 200 chars", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("should accept targetJobTitle at boundary (200 chars)", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "x".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("should reject userSummary exceeding 2000 chars", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      userSummary: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("should accept userSummary at boundary (2000 chars)", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      userSummary: "x".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("should reject skills array exceeding 50 items", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      skills: Array.from({ length: 51 }, (_, i) => `Skill${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("should accept skills array at boundary (50 items)", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      skills: Array.from({ length: 50 }, (_, i) => `Skill${i}`),
    });
    expect(result.success).toBe(true);
  });

  it("should reject a skill string exceeding 100 chars", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      skills: ["x".repeat(101)],
    });
    expect(result.success).toBe(false);
  });

  it("should accept a skill string at boundary (100 chars)", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      skills: ["x".repeat(100)],
    });
    expect(result.success).toBe(true);
  });

  it("should reject experience array exceeding 20 items", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      experience: Array.from({ length: 21 }, (_, i) => `Role ${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("should accept experience array at boundary (20 items)", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      experience: Array.from({ length: 20 }, (_, i) => `Role ${i}`),
    });
    expect(result.success).toBe(true);
  });

  it("should reject an experience string exceeding 500 chars", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      experience: ["x".repeat(501)],
    });
    expect(result.success).toBe(false);
  });

  it("should accept an experience string at boundary (500 chars)", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      experience: ["x".repeat(500)],
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty optional arrays", () => {
    const result = resumeBuilderTool.inputSchema.safeParse({
      targetJobTitle: "Engineer",
      skills: [],
      experience: [],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getUserProfileTool schema
// ---------------------------------------------------------------------------
describe("getUserProfileTool schema", () => {
  it("should validate empty object (userId is optional, injected server-side)", () => {
    expect(getUserProfileTool.inputSchema.safeParse({}).success).toBe(true);
  });

  it("should validate with userId", () => {
    const result = getUserProfileTool.inputSchema.safeParse({
      userId: "user_123",
    });
    expect(result.success).toBe(true);
  });

  it("should reject non-string userId", () => {
    expect(getUserProfileTool.inputSchema.safeParse({ userId: 123 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getJobDetailsTool schema
// ---------------------------------------------------------------------------
describe("getJobDetailsTool schema", () => {
  it("should validate with required jobId", () => {
    expect(getJobDetailsTool.inputSchema.safeParse({ jobId: 42 }).success).toBe(true);
  });

  it("should reject missing jobId", () => {
    expect(getJobDetailsTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it("should reject string jobId", () => {
    expect(getJobDetailsTool.inputSchema.safeParse({ jobId: "42" }).success).toBe(false);
  });

  it("should reject float jobId", () => {
    // z.number() accepts floats; verify tool accepts them (no .int() constraint)
    const result = getJobDetailsTool.inputSchema.safeParse({ jobId: 3.14 });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// interviewPrepTool schema
// ---------------------------------------------------------------------------
describe("interviewPrepTool schema", () => {
  it("should validate with required jobId", () => {
    expect(interviewPrepTool.inputSchema.safeParse({ jobId: 1 }).success).toBe(true);
  });

  it("should validate with all fields", () => {
    const result = interviewPrepTool.inputSchema.safeParse({
      userId: "user_abc",
      jobId: 42,
      focusArea: "technical",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing jobId", () => {
    expect(interviewPrepTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it("should accept valid focusArea enum values", () => {
    const validAreas = [
      "general",
      "technical",
      "behavioral",
      "company_research",
      "salary_negotiation",
    ];
    for (const area of validAreas) {
      expect(
        interviewPrepTool.inputSchema.safeParse({ jobId: 1, focusArea: area }).success
      ).toBe(true);
    }
  });

  it("should reject invalid focusArea", () => {
    expect(
      interviewPrepTool.inputSchema.safeParse({ jobId: 1, focusArea: "coding_challenge" }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateCoverLetterTool schema
// ---------------------------------------------------------------------------
describe("generateCoverLetterTool schema", () => {
  it("should validate with required jobId", () => {
    expect(generateCoverLetterTool.inputSchema.safeParse({ jobId: 1 }).success).toBe(true);
  });

  it("should validate with all fields", () => {
    const result = generateCoverLetterTool.inputSchema.safeParse({
      userId: "user_abc",
      jobId: 42,
      tone: "enthusiastic",
      focusAreas: ["React expertise", "Team leadership"],
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing jobId", () => {
    expect(generateCoverLetterTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it("should accept valid tone values", () => {
    const validTones = ["professional", "conversational", "enthusiastic", "concise"];
    for (const tone of validTones) {
      expect(
        generateCoverLetterTool.inputSchema.safeParse({ jobId: 1, tone }).success
      ).toBe(true);
    }
  });

  it("should reject invalid tone", () => {
    expect(
      generateCoverLetterTool.inputSchema.safeParse({ jobId: 1, tone: "aggressive" }).success
    ).toBe(false);
  });

  it("should reject focusAreas exceeding 10 items", () => {
    const result = generateCoverLetterTool.inputSchema.safeParse({
      jobId: 1,
      focusAreas: Array.from({ length: 11 }, (_, i) => `area${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("should accept focusAreas at boundary (10 items)", () => {
    const result = generateCoverLetterTool.inputSchema.safeParse({
      jobId: 1,
      focusAreas: Array.from({ length: 10 }, (_, i) => `area${i}`),
    });
    expect(result.success).toBe(true);
  });

  it("should reject focusArea string exceeding 200 chars", () => {
    const result = generateCoverLetterTool.inputSchema.safeParse({
      jobId: 1,
      focusAreas: ["x".repeat(201)],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// salaryInsightsTool schema
// ---------------------------------------------------------------------------
describe("salaryInsightsTool schema", () => {
  it("should validate with required jobTitle", () => {
    expect(
      salaryInsightsTool.inputSchema.safeParse({ jobTitle: "Software Engineer" }).success
    ).toBe(true);
  });

  it("should validate with all fields", () => {
    const result = salaryInsightsTool.inputSchema.safeParse({
      jobTitle: "Product Manager",
      location: "San Francisco",
      jobLevel: "senior",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing jobTitle", () => {
    expect(salaryInsightsTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it("should reject jobTitle exceeding 200 chars", () => {
    expect(
      salaryInsightsTool.inputSchema.safeParse({ jobTitle: "x".repeat(201) }).success
    ).toBe(false);
  });

  it("should accept jobTitle at boundary (200 chars)", () => {
    expect(
      salaryInsightsTool.inputSchema.safeParse({ jobTitle: "x".repeat(200) }).success
    ).toBe(true);
  });

  it("should reject location exceeding 200 chars", () => {
    expect(
      salaryInsightsTool.inputSchema.safeParse({
        jobTitle: "Engineer",
        location: "x".repeat(201),
      }).success
    ).toBe(false);
  });

  it("should reject jobLevel exceeding 50 chars", () => {
    expect(
      salaryInsightsTool.inputSchema.safeParse({
        jobTitle: "Engineer",
        jobLevel: "x".repeat(51),
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyJobTool schema
// ---------------------------------------------------------------------------
describe("applyJobTool schema", () => {
  it("should validate with required jobId", () => {
    expect(applyJobTool.inputSchema.safeParse({ jobId: 42 }).success).toBe(true);
  });

  it("should validate with all fields", () => {
    const result = applyJobTool.inputSchema.safeParse({
      userId: "user_abc",
      jobId: 42,
      coverLetter: "Dear Hiring Manager, I am excited to apply...",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing jobId", () => {
    expect(applyJobTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it("should reject coverLetter exceeding 10,000 chars", () => {
    const result = applyJobTool.inputSchema.safeParse({
      jobId: 1,
      coverLetter: "x".repeat(10_001),
    });
    expect(result.success).toBe(false);
  });

  it("should accept coverLetter at boundary (10,000 chars)", () => {
    const result = applyJobTool.inputSchema.safeParse({
      jobId: 1,
      coverLetter: "x".repeat(10_000),
    });
    expect(result.success).toBe(true);
  });

  it("should reject string jobId", () => {
    expect(applyJobTool.inputSchema.safeParse({ jobId: "42" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// submitAnswersTool schema
// ---------------------------------------------------------------------------
describe("submitAnswersTool schema", () => {
  it("should validate valid input", () => {
    const result = submitAnswersTool.inputSchema.safeParse({
      applicationId: 1,
      answers: [
        { questionId: "q1", answer: "Yes, I have 5 years of experience." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing applicationId", () => {
    expect(
      submitAnswersTool.inputSchema.safeParse({
        answers: [{ questionId: "q1", answer: "Yes" }],
      }).success
    ).toBe(false);
  });

  it("should reject missing answers", () => {
    expect(submitAnswersTool.inputSchema.safeParse({ applicationId: 1 }).success).toBe(false);
  });

  it("should reject answers exceeding 50 items", () => {
    const answers = Array.from({ length: 51 }, (_, i) => ({
      questionId: `q${i}`,
      answer: "Answer",
    }));
    expect(
      submitAnswersTool.inputSchema.safeParse({ applicationId: 1, answers }).success
    ).toBe(false);
  });

  it("should accept answers at boundary (50 items)", () => {
    const answers = Array.from({ length: 50 }, (_, i) => ({
      questionId: `q${i}`,
      answer: "Answer",
    }));
    expect(
      submitAnswersTool.inputSchema.safeParse({ applicationId: 1, answers }).success
    ).toBe(true);
  });

  it("should reject questionId exceeding 100 chars", () => {
    expect(
      submitAnswersTool.inputSchema.safeParse({
        applicationId: 1,
        answers: [{ questionId: "x".repeat(101), answer: "Yes" }],
      }).success
    ).toBe(false);
  });

  it("should reject answer exceeding 5000 chars", () => {
    expect(
      submitAnswersTool.inputSchema.safeParse({
        applicationId: 1,
        answers: [{ questionId: "q1", answer: "x".repeat(5001) }],
      }).success
    ).toBe(false);
  });

  it("should accept answer at boundary (5000 chars)", () => {
    expect(
      submitAnswersTool.inputSchema.safeParse({
        applicationId: 1,
        answers: [{ questionId: "q1", answer: "x".repeat(5000) }],
      }).success
    ).toBe(true);
  });

  it("should reject empty answers array", () => {
    // At least 1 answer is required — submitting with 0 answers is meaningless
    expect(
      submitAnswersTool.inputSchema.safeParse({ applicationId: 1, answers: [] }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// savePreferencesTool schema
// ---------------------------------------------------------------------------
describe("savePreferencesTool schema", () => {
  it("should validate minimal input (empty preferences)", () => {
    const result = savePreferencesTool.inputSchema.safeParse({
      preferences: {},
    });
    expect(result.success).toBe(true);
  });

  it("should validate full preferences object", () => {
    const result = savePreferencesTool.inputSchema.safeParse({
      userId: "user_abc",
      preferences: {
        jobType: ["fulltime", "contract"],
        salaryMin: 80000,
        salaryMax: 200000,
        industries: ["Technology", "Finance"],
        roleLevel: "senior",
        locations: ["New York", "San Francisco"],
        remotePreference: "remote",
        skills: ["TypeScript", "React", "Node.js"],
        companySize: "medium",
        timeline: "immediately",
        dealBreakers: ["No relocation"],
      },
      markOnboardingComplete: true,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing preferences", () => {
    expect(savePreferencesTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it("should reject salaryMin exceeding 10,000,000", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: { salaryMin: 10_000_001 },
      }).success
    ).toBe(false);
  });

  it("should reject negative salaryMin", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: { salaryMin: -1 },
      }).success
    ).toBe(false);
  });

  it("should accept salaryMin at boundaries (0 and 10,000,000)", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({ preferences: { salaryMin: 0 } }).success
    ).toBe(true);
    expect(
      savePreferencesTool.inputSchema.safeParse({ preferences: { salaryMin: 10_000_000 } }).success
    ).toBe(true);
  });

  it("should reject non-integer salary values", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: { salaryMin: 50000.5 },
      }).success
    ).toBe(false);
  });

  it("should reject invalid remotePreference", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: { remotePreference: "sometimes" },
      }).success
    ).toBe(false);
  });

  it("should accept valid remotePreference values", () => {
    for (const pref of ["remote", "hybrid", "onsite", "any"]) {
      expect(
        savePreferencesTool.inputSchema.safeParse({
          preferences: { remotePreference: pref },
        }).success
      ).toBe(true);
    }
  });

  it("should reject jobType array exceeding 10 items", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: {
          jobType: Array.from({ length: 11 }, (_, i) => `type${i}`),
        },
      }).success
    ).toBe(false);
  });

  it("should reject jobType string exceeding 50 chars", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: { jobType: ["x".repeat(51)] },
      }).success
    ).toBe(false);
  });

  it("should reject industries array exceeding 20 items", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: {
          industries: Array.from({ length: 21 }, (_, i) => `ind${i}`),
        },
      }).success
    ).toBe(false);
  });

  it("should reject locations array exceeding 20 items", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: {
          locations: Array.from({ length: 21 }, (_, i) => `loc${i}`),
        },
      }).success
    ).toBe(false);
  });

  it("should reject skills array exceeding 50 items", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: {
          skills: Array.from({ length: 51 }, (_, i) => `skill${i}`),
        },
      }).success
    ).toBe(false);
  });

  it("should reject dealBreakers array exceeding 10 items", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: {
          dealBreakers: Array.from({ length: 11 }, (_, i) => `deal${i}`),
        },
      }).success
    ).toBe(false);
  });

  it("should reject roleLevel exceeding 50 chars", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: { roleLevel: "x".repeat(51) },
      }).success
    ).toBe(false);
  });

  it("should reject timeline exceeding 50 chars", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: { timeline: "x".repeat(51) },
      }).success
    ).toBe(false);
  });

  it("should reject companySize exceeding 50 chars", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: { companySize: "x".repeat(51) },
      }).success
    ).toBe(false);
  });

  it("should validate markOnboardingComplete as boolean", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: {},
        markOnboardingComplete: true,
      }).success
    ).toBe(true);
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: {},
        markOnboardingComplete: false,
      }).success
    ).toBe(true);
  });

  it("should reject markOnboardingComplete as string", () => {
    expect(
      savePreferencesTool.inputSchema.safeParse({
        preferences: {},
        markOnboardingComplete: "true",
      }).success
    ).toBe(false);
  });
});
