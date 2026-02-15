import { searchJobsTool } from "../search-jobs";
import { updateFiltersTool } from "../update-filters";
import { createAlertTool } from "../create-alert";
import { favoriteJobTool } from "../favorite-job";

describe("searchJobsTool schema", () => {
  it("should validate valid input with all fields", () => {
    const result = searchJobsTool.parameters.safeParse({
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
    const result = searchJobsTool.parameters.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should validate input with only keywords", () => {
    const result = searchJobsTool.parameters.safeParse({
      keywords: "python",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keywords).toBe("python");
    }
  });

  it("should validate input with only location", () => {
    const result = searchJobsTool.parameters.safeParse({
      location: "New York",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBe("New York");
    }
  });

  it("should apply default values for limit and offset", () => {
    const result = searchJobsTool.parameters.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.offset).toBe(0);
    }
  });

  it("should reject invalid jobType", () => {
    const result = searchJobsTool.parameters.safeParse({
      jobType: "invalid-type",
    });

    expect(result.success).toBe(false);
  });

  it("should accept valid jobType values", () => {
    const validTypes = ["fulltime", "parttime", "internship", "contract"];

    for (const jobType of validTypes) {
      const result = searchJobsTool.parameters.safeParse({ jobType });
      expect(result.success).toBe(true);
    }
  });

  it("should validate skills as array of strings", () => {
    const result = searchJobsTool.parameters.safeParse({
      skills: ["JavaScript", "Node.js", "Docker"],
    });

    expect(result.success).toBe(true);
  });

  it("should reject non-array skills", () => {
    const result = searchJobsTool.parameters.safeParse({
      skills: "JavaScript",
    });

    expect(result.success).toBe(false);
  });

  it("should validate salaryMin as number", () => {
    const result = searchJobsTool.parameters.safeParse({
      salaryMin: 50000,
    });

    expect(result.success).toBe(true);
  });

  it("should reject string salaryMin", () => {
    const result = searchJobsTool.parameters.safeParse({
      salaryMin: "50000",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateFiltersTool schema", () => {
  it("should validate valid input with all fields", () => {
    const result = updateFiltersTool.parameters.safeParse({
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
    const result = updateFiltersTool.parameters.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should validate partial input", () => {
    const result = updateFiltersTool.parameters.safeParse({
      keywords: "engineer",
      isRemote: false,
    });

    expect(result.success).toBe(true);
  });

  it("should reject invalid jobType", () => {
    const result = updateFiltersTool.parameters.safeParse({
      jobType: "freelance",
    });

    expect(result.success).toBe(false);
  });

  it("should accept valid jobType values", () => {
    const validTypes = ["fulltime", "parttime", "internship", "contract"];

    for (const jobType of validTypes) {
      const result = updateFiltersTool.parameters.safeParse({ jobType });
      expect(result.success).toBe(true);
    }
  });

  it("should validate boolean isRemote", () => {
    const trueResult = updateFiltersTool.parameters.safeParse({
      isRemote: true,
    });
    const falseResult = updateFiltersTool.parameters.safeParse({
      isRemote: false,
    });

    expect(trueResult.success).toBe(true);
    expect(falseResult.success).toBe(true);
  });

  it("should reject string isRemote", () => {
    const result = updateFiltersTool.parameters.safeParse({
      isRemote: "true",
    });

    expect(result.success).toBe(false);
  });
});

describe("createAlertTool schema", () => {
  it("should validate valid input with required fields", () => {
    const result = createAlertTool.parameters.safeParse({
      userId: "user_123",
      frequency: "daily",
    });

    expect(result.success).toBe(true);
  });

  it("should validate input with all fields", () => {
    const result = createAlertTool.parameters.safeParse({
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

  it("should reject missing userId", () => {
    const result = createAlertTool.parameters.safeParse({
      frequency: "daily",
    });

    expect(result.success).toBe(false);
  });

  it("should reject missing frequency", () => {
    const result = createAlertTool.parameters.safeParse({
      userId: "user_123",
    });

    expect(result.success).toBe(false);
  });

  it("should reject invalid frequency", () => {
    const result = createAlertTool.parameters.safeParse({
      userId: "user_123",
      frequency: "hourly",
    });

    expect(result.success).toBe(false);
  });

  it("should accept valid frequency values", () => {
    const validFrequencies = ["daily", "twice_daily", "weekly"];

    for (const frequency of validFrequencies) {
      const result = createAlertTool.parameters.safeParse({
        userId: "user_123",
        frequency,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid remoteType", () => {
    const result = createAlertTool.parameters.safeParse({
      userId: "user_123",
      frequency: "daily",
      remoteType: "hybrid",
    });

    expect(result.success).toBe(false);
  });

  it("should accept valid remoteType values", () => {
    const validRemoteTypes = ["remote", "onsite", "any"];

    for (const remoteType of validRemoteTypes) {
      const result = createAlertTool.parameters.safeParse({
        userId: "user_123",
        frequency: "daily",
        remoteType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should validate arrays for optional fields", () => {
    const result = createAlertTool.parameters.safeParse({
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
    const result = createAlertTool.parameters.safeParse({
      userId: "user_123",
      frequency: "daily",
      keywords: "javascript",
    });

    expect(result.success).toBe(false);
  });
});

describe("favoriteJobTool schema", () => {
  it("should validate valid input", () => {
    const result = favoriteJobTool.parameters.safeParse({
      jobId: 123,
      userId: "user_abc",
    });

    expect(result.success).toBe(true);
  });

  it("should reject missing jobId", () => {
    const result = favoriteJobTool.parameters.safeParse({
      userId: "user_abc",
    });

    expect(result.success).toBe(false);
  });

  it("should reject missing userId", () => {
    const result = favoriteJobTool.parameters.safeParse({
      jobId: 123,
    });

    expect(result.success).toBe(false);
  });

  it("should reject string jobId", () => {
    const result = favoriteJobTool.parameters.safeParse({
      jobId: "123",
      userId: "user_abc",
    });

    expect(result.success).toBe(false);
  });

  it("should accept numeric userId as string", () => {
    const result = favoriteJobTool.parameters.safeParse({
      jobId: 456,
      userId: "123456",
    });

    expect(result.success).toBe(true);
  });

  it("should reject number userId", () => {
    const result = favoriteJobTool.parameters.safeParse({
      jobId: 123,
      userId: 456,
    });

    expect(result.success).toBe(false);
  });

  it("should validate with large jobId", () => {
    const result = favoriteJobTool.parameters.safeParse({
      jobId: 999999,
      userId: "user_xyz",
    });

    expect(result.success).toBe(true);
  });
});
