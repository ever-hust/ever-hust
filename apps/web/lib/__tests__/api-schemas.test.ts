/**
 * Unit tests for API Zod schemas.
 * Validates that schemas correctly accept valid data and reject invalid data.
 */
import {
  jobSearchParamsSchema,
  chatRequestSchema,
  checkoutSchema,
  favoriteToggleSchema,
  profilePatchSchema,
  alertCreateSchema,
  userPreferencesSchema,
  cvParsedDataSchema,
  parseBody,
} from "../api-schemas";

describe("jobSearchParamsSchema", () => {
  it("accepts valid search params with defaults", () => {
    const result = jobSearchParamsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(25);
    }
  });

  it("coerces string numbers to integers", () => {
    const result = jobSearchParamsSchema.safeParse({
      page: "3",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("accepts full search params", () => {
    const result = jobSearchParamsSchema.safeParse({
      page: "1",
      limit: "25",
      keywords: "react developer",
      location: "New York",
      isRemote: "true",
      jobType: "fulltime",
      salaryMin: "80000",
      salaryMax: "150000",
    });
    expect(result.success).toBe(true);
  });

  it("transforms isRemote string to boolean", () => {
    const result = jobSearchParamsSchema.safeParse({ isRemote: "true" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isRemote).toBe(true);
    }
  });

  it("rejects page < 1", () => {
    const result = jobSearchParamsSchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 100", () => {
    const result = jobSearchParamsSchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });
});

describe("chatRequestSchema", () => {
  it("accepts valid chat message", () => {
    const result = chatRequestSchema.safeParse({
      messages: [
        { id: "1", role: "user", content: "Hello" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = chatRequestSchema.safeParse({
      messages: [
        { id: "1", role: "admin", content: "Hello" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing messages", () => {
    const result = chatRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("accepts valid plan IDs", () => {
    expect(checkoutSchema.safeParse({ planId: "monthly" }).success).toBe(true);
    expect(checkoutSchema.safeParse({ planId: "quarterly" }).success).toBe(true);
    expect(checkoutSchema.safeParse({ planId: "annual" }).success).toBe(true);
  });

  it("rejects invalid plan ID", () => {
    expect(checkoutSchema.safeParse({ planId: "free" }).success).toBe(false);
  });
});

describe("favoriteToggleSchema", () => {
  it("accepts valid job ID", () => {
    const result = favoriteToggleSchema.safeParse({ jobId: 42 });
    expect(result.success).toBe(true);
  });

  it("rejects zero", () => {
    const result = favoriteToggleSchema.safeParse({ jobId: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative", () => {
    const result = favoriteToggleSchema.safeParse({ jobId: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer", () => {
    const result = favoriteToggleSchema.safeParse({ jobId: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe("profilePatchSchema", () => {
  it("accepts partial updates", () => {
    const result = profilePatchSchema.safeParse({ name: "John Doe" });
    expect(result.success).toBe(true);
  });

  it("accepts skills array", () => {
    const result = profilePatchSchema.safeParse({
      skills: ["TypeScript", "React", "Node.js"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects name > 200 chars", () => {
    const result = profilePatchSchema.safeParse({ name: "x".repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe("userPreferencesSchema", () => {
  it("accepts empty object (all optional)", () => {
    const result = userPreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts full preferences", () => {
    const result = userPreferencesSchema.safeParse({
      jobTypes: ["fulltime", "contract"],
      salaryMin: 80000,
      salaryMax: 200000,
      salaryCurrency: "USD",
      industries: ["Technology", "Finance"],
      roleLevel: ["senior", "lead"],
      locations: ["New York", "San Francisco"],
      remotePreference: "remote",
      skills: ["TypeScript", "React"],
      companySizes: ["startup", "medium"],
      timeline: "immediately",
      dealBreakers: ["No relocation", "No consulting"],
      aiModel: "claude-opus-4-6",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid remote preference", () => {
    const result = userPreferencesSchema.safeParse({
      remotePreference: "sometimes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid company size", () => {
    const result = userPreferencesSchema.safeParse({
      companySizes: ["tiny"],
    });
    expect(result.success).toBe(false);
  });
});

describe("cvParsedDataSchema", () => {
  it("accepts valid parsed CV data", () => {
    const result = cvParsedDataSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      skills: ["Python", "Machine Learning"],
      experience: [
        {
          company: "TechCorp",
          title: "Senior Engineer",
          startDate: "2020-01",
          endDate: "Present",
        },
      ],
      education: [
        {
          institution: "MIT",
          degree: "BSc",
          field: "Computer Science",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal CV data", () => {
    const result = cvParsedDataSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("alertCreateSchema", () => {
  it("accepts valid alert", () => {
    const result = alertCreateSchema.safeParse({
      frequency: "daily",
      email: "user@example.com",
      criteria: {
        keywords: ["react developer"],
        locations: ["NYC"],
        remoteType: "remote",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid frequency", () => {
    const result = alertCreateSchema.safeParse({
      frequency: "hourly",
      email: "user@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = alertCreateSchema.safeParse({
      frequency: "daily",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("parseBody helper", () => {
  it("returns success with parsed data for valid input", () => {
    const result = parseBody(checkoutSchema, { planId: "monthly" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.planId).toBe("monthly");
    }
  });

  it("returns error string for invalid input", () => {
    const result = parseBody(checkoutSchema, { planId: "invalid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
