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
  alertPatchSchema,
  alertDeleteSchema,
  settingsPatchSchema,
  userPreferencesSchema,
  cvParsedDataSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  referralInviteSchema,
  referralRedeemSchema,
  updateUserRoleSchema,
  adminUsersQuerySchema,
  adminJobsQuerySchema,
  createApiKeySchema,
  jobsApiQuerySchema,
  companiesApiQuerySchema,
  salaryApiQuerySchema,
  analyticsDateRangeSchema,
  createOrganizationSchema,
  updateOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  brandingConfigSchema,
  orgAiConfigSchema,
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

  it("rejects negative salaryMin", () => {
    const result = jobSearchParamsSchema.safeParse({ salaryMin: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects negative salaryMax", () => {
    const result = jobSearchParamsSchema.safeParse({ salaryMax: "-1" });
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

  it("rejects content exceeding 50,000 chars", () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ id: "1", role: "user", content: "x".repeat(50_001) }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts content at exactly 50,000 chars", () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ id: "1", role: "user", content: "x".repeat(50_000) }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 100 messages", () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      content: "hi",
    }));
    const result = chatRequestSchema.safeParse({ messages });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 100 messages", () => {
    const messages = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      content: "hi",
    }));
    const result = chatRequestSchema.safeParse({ messages });
    expect(result.success).toBe(true);
  });

  it("rejects more than 200 parts", () => {
    const result = chatRequestSchema.safeParse({
      messages: [
        {
          id: "1",
          role: "user",
          content: "hi",
          parts: Array.from({ length: 201 }, () => ({ type: "text" })),
        },
      ],
    });
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

  it("accepts skills array at boundary (50 items)", () => {
    const result = profilePatchSchema.safeParse({
      skills: Array.from({ length: 50 }, (_, i) => `skill${i}`),
    });
    expect(result.success).toBe(true);
  });

  it("rejects skills array exceeding 50 items", () => {
    const result = profilePatchSchema.safeParse({
      skills: Array.from({ length: 51 }, (_, i) => `skill${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("accepts experience array at boundary (20 items)", () => {
    const exp = Array.from({ length: 20 }, (_, i) => ({
      title: `Title ${i}`,
      company: `Company ${i}`,
    }));
    const result = profilePatchSchema.safeParse({ experience: exp });
    expect(result.success).toBe(true);
  });

  it("rejects experience array exceeding 20 items", () => {
    const exp = Array.from({ length: 21 }, (_, i) => ({
      title: `Title ${i}`,
      company: `Company ${i}`,
    }));
    const result = profilePatchSchema.safeParse({ experience: exp });
    expect(result.success).toBe(false);
  });

  it("accepts empty skills array", () => {
    const result = profilePatchSchema.safeParse({ skills: [] });
    expect(result.success).toBe(true);
  });

  it("strips HTML tags from skills (XSS prevention)", () => {
    const result = profilePatchSchema.safeParse({
      skills: ['<script>alert("xss")</script>', "React", '<img src=x onerror="steal()">'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual(['alert("xss")', "React", ""]);
    }
  });

  it("trims whitespace from skills after HTML stripping", () => {
    const result = profilePatchSchema.safeParse({
      skills: ["  React  ", " <b>TypeScript</b> "],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual(["React", "TypeScript"]);
    }
  });

  it("preserves normal skills unchanged", () => {
    const result = profilePatchSchema.safeParse({
      skills: ["C++", "C#", "CI/CD", "Node.js", "Machine Learning"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual(["C++", "C#", "CI/CD", "Node.js", "Machine Learning"]);
    }
  });

  it("strips HTML tags from name (XSS prevention)", () => {
    const result = profilePatchSchema.safeParse({
      name: '<script>alert("xss")</script>John',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('alert("xss")John');
    }
  });

  it("strips HTML tags from headline (XSS prevention)", () => {
    const result = profilePatchSchema.safeParse({
      headline: 'Senior <img src=x onerror="steal()"> Developer',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.headline).toBe("Senior  Developer");
    }
  });

  it("strips HTML tags from location (XSS prevention)", () => {
    const result = profilePatchSchema.safeParse({
      location: "<b>New York</b>, NY",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBe("New York, NY");
    }
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

  it("accepts criteria with salary range", () => {
    const result = alertCreateSchema.safeParse({
      frequency: "daily",
      email: "user@example.com",
      criteria: {
        salary: { min: 50_000, max: 150_000 },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative salary values", () => {
    const result = alertCreateSchema.safeParse({
      frequency: "daily",
      email: "user@example.com",
      criteria: { salary: { min: -1 } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects salary exceeding 10,000,000", () => {
    const result = alertCreateSchema.safeParse({
      frequency: "daily",
      email: "user@example.com",
      criteria: { salary: { max: 10_000_001 } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts criteria at array boundaries (20 keywords, 10 locations, 30 skills)", () => {
    const result = alertCreateSchema.safeParse({
      frequency: "weekly",
      email: "user@example.com",
      criteria: {
        keywords: Array.from({ length: 20 }, (_, i) => `kw${i}`),
        locations: Array.from({ length: 10 }, (_, i) => `loc${i}`),
        skills: Array.from({ length: 30 }, (_, i) => `skill${i}`),
        roleLevel: Array.from({ length: 10 }, (_, i) => `level${i}`),
        industries: Array.from({ length: 20 }, (_, i) => `ind${i}`),
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects criteria exceeding array limits", () => {
    const result = alertCreateSchema.safeParse({
      frequency: "daily",
      email: "user@example.com",
      criteria: {
        keywords: Array.from({ length: 21 }, (_, i) => `kw${i}`),
      },
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

  it("includes field path in error message", () => {
    const result = parseBody(alertCreateSchema, {
      frequency: "invalid",
      email: "bad",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("frequency");
    }
  });
});

// ========================================================================
// Settings PATCH
// ========================================================================

describe("settingsPatchSchema", () => {
  it("accepts empty object (all optional)", () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(true);
  });

  it("accepts name only", () => {
    const result = settingsPatchSchema.safeParse({ name: "Alice" });
    expect(result.success).toBe(true);
  });

  it("accepts preferences with AI model", () => {
    const result = settingsPatchSchema.safeParse({
      preferences: { aiModel: "claude-sonnet-4-20250514" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts preferences with API keys", () => {
    const result = settingsPatchSchema.safeParse({
      preferences: {
        apiKeys: { anthropic: "sk-ant-test123", openai: "sk-test456" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects name > 200 chars", () => {
    expect(settingsPatchSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects headline > 500 chars", () => {
    expect(settingsPatchSchema.safeParse({ headline: "x".repeat(501) }).success).toBe(false);
  });

  it("strips unknown keys in preferences (passthrough to userPreferencesSchema)", () => {
    const result = settingsPatchSchema.safeParse({
      preferences: { aiModel: "test", unknownKey: "nope" },
    });
    // Unknown keys are stripped (not rejected), aiModel is preserved
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferences?.aiModel).toBe("test");
      expect((result.data.preferences as Record<string, unknown>)?.unknownKey).toBeUndefined();
    }
  });

  it("strips HTML tags from name (XSS prevention)", () => {
    const result = settingsPatchSchema.safeParse({
      name: '<script>alert("xss")</script>Alice',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('alert("xss")Alice');
    }
  });

  it("strips HTML tags from headline and location", () => {
    const result = settingsPatchSchema.safeParse({
      headline: '<img src=x onerror="steal()">Engineer',
      location: "<b>NYC</b>",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.headline).toBe("Engineer");
      expect(result.data.location).toBe("NYC");
    }
  });
});

// ========================================================================
// Alert PATCH & DELETE
// ========================================================================

describe("alertPatchSchema", () => {
  it("accepts valid patch with id and isActive", () => {
    const result = alertPatchSchema.safeParse({ id: 1, isActive: false });
    expect(result.success).toBe(true);
  });

  it("accepts frequency update", () => {
    const result = alertPatchSchema.safeParse({ id: 5, frequency: "weekly" });
    expect(result.success).toBe(true);
  });

  it("accepts email update", () => {
    const result = alertPatchSchema.safeParse({ id: 1, email: "new@example.com" });
    expect(result.success).toBe(true);
  });

  it("accepts criteria update", () => {
    const result = alertPatchSchema.safeParse({
      id: 1,
      criteria: { keywords: ["python"], locations: ["Berlin"] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    expect(alertPatchSchema.safeParse({ isActive: true }).success).toBe(false);
  });

  it("rejects non-positive id", () => {
    expect(alertPatchSchema.safeParse({ id: 0 }).success).toBe(false);
    expect(alertPatchSchema.safeParse({ id: -1 }).success).toBe(false);
  });

  it("rejects non-integer id", () => {
    expect(alertPatchSchema.safeParse({ id: 1.5 }).success).toBe(false);
  });

  it("rejects invalid frequency", () => {
    expect(alertPatchSchema.safeParse({ id: 1, frequency: "hourly" }).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(alertPatchSchema.safeParse({ id: 1, email: "not-email" }).success).toBe(false);
  });
});

describe("alertDeleteSchema", () => {
  it("accepts valid positive integer id", () => {
    expect(alertDeleteSchema.safeParse({ id: 42 }).success).toBe(true);
  });

  it("rejects zero", () => {
    expect(alertDeleteSchema.safeParse({ id: 0 }).success).toBe(false);
  });

  it("rejects negative id", () => {
    expect(alertDeleteSchema.safeParse({ id: -5 }).success).toBe(false);
  });

  it("rejects non-integer", () => {
    expect(alertDeleteSchema.safeParse({ id: 3.14 }).success).toBe(false);
  });

  it("rejects missing id", () => {
    expect(alertDeleteSchema.safeParse({}).success).toBe(false);
  });

  it("rejects string id", () => {
    expect(alertDeleteSchema.safeParse({ id: "42" }).success).toBe(false);
  });
});

// ========================================================================
// Push Subscription
// ========================================================================

describe("pushSubscribeSchema", () => {
  it("accepts valid subscription", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "BNcRd...", auth: "tBHI..." },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-URL endpoint", () => {
    expect(
      pushSubscribeSchema.safeParse({
        endpoint: "not-a-url",
        keys: { p256dh: "key", auth: "key" },
      }).success
    ).toBe(false);
  });

  it("rejects endpoint > 2048 chars", () => {
    expect(
      pushSubscribeSchema.safeParse({
        endpoint: "https://example.com/" + "a".repeat(2048),
        keys: { p256dh: "key", auth: "key" },
      }).success
    ).toBe(false);
  });

  it("rejects empty p256dh key", () => {
    expect(
      pushSubscribeSchema.safeParse({
        endpoint: "https://example.com/push",
        keys: { p256dh: "", auth: "key" },
      }).success
    ).toBe(false);
  });

  it("rejects empty auth key", () => {
    expect(
      pushSubscribeSchema.safeParse({
        endpoint: "https://example.com/push",
        keys: { p256dh: "key", auth: "" },
      }).success
    ).toBe(false);
  });

  it("rejects missing keys", () => {
    expect(
      pushSubscribeSchema.safeParse({
        endpoint: "https://example.com/push",
      }).success
    ).toBe(false);
  });
});

describe("pushUnsubscribeSchema", () => {
  it("accepts valid endpoint", () => {
    expect(
      pushUnsubscribeSchema.safeParse({
        endpoint: "https://example.com/push/abc",
      }).success
    ).toBe(true);
  });

  it("rejects non-URL endpoint", () => {
    expect(
      pushUnsubscribeSchema.safeParse({ endpoint: "foobar" }).success
    ).toBe(false);
  });

  it("rejects missing endpoint", () => {
    expect(pushUnsubscribeSchema.safeParse({}).success).toBe(false);
  });
});

// ========================================================================
// Referral Schemas
// ========================================================================

describe("referralInviteSchema", () => {
  it("accepts valid email", () => {
    expect(referralInviteSchema.safeParse({ email: "friend@example.com" }).success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(referralInviteSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("rejects email > 320 chars", () => {
    const longEmail = "a".repeat(310) + "@example.com";
    expect(referralInviteSchema.safeParse({ email: longEmail }).success).toBe(false);
  });

  it("rejects empty email", () => {
    expect(referralInviteSchema.safeParse({ email: "" }).success).toBe(false);
  });

  it("rejects missing email", () => {
    expect(referralInviteSchema.safeParse({}).success).toBe(false);
  });
});

describe("referralRedeemSchema", () => {
  it("accepts valid uppercase alphanumeric code", () => {
    expect(referralRedeemSchema.safeParse({ code: "ABC123" }).success).toBe(true);
  });

  it("rejects lowercase code", () => {
    expect(referralRedeemSchema.safeParse({ code: "abc123" }).success).toBe(false);
  });

  it("rejects code with special characters", () => {
    expect(referralRedeemSchema.safeParse({ code: "AB-12!" }).success).toBe(false);
  });

  it("rejects empty code", () => {
    expect(referralRedeemSchema.safeParse({ code: "" }).success).toBe(false);
  });

  it("rejects code > 20 chars", () => {
    expect(referralRedeemSchema.safeParse({ code: "A".repeat(21) }).success).toBe(false);
  });

  it("accepts single character code", () => {
    expect(referralRedeemSchema.safeParse({ code: "A" }).success).toBe(true);
  });

  it("accepts max length code (20 chars)", () => {
    expect(referralRedeemSchema.safeParse({ code: "A".repeat(20) }).success).toBe(true);
  });
});

// ========================================================================
// Admin Schemas
// ========================================================================

describe("updateUserRoleSchema", () => {
  it("accepts 'user' role", () => {
    expect(updateUserRoleSchema.safeParse({ role: "user" }).success).toBe(true);
  });

  it("accepts 'recruiter' role", () => {
    expect(updateUserRoleSchema.safeParse({ role: "recruiter" }).success).toBe(true);
  });

  it("accepts 'admin' role", () => {
    expect(updateUserRoleSchema.safeParse({ role: "admin" }).success).toBe(true);
  });

  it("rejects invalid role", () => {
    expect(updateUserRoleSchema.safeParse({ role: "superadmin" }).success).toBe(false);
  });

  it("rejects empty string role", () => {
    expect(updateUserRoleSchema.safeParse({ role: "" }).success).toBe(false);
  });

  it("rejects missing role", () => {
    expect(updateUserRoleSchema.safeParse({}).success).toBe(false);
  });
});

describe("adminUsersQuerySchema", () => {
  it("provides defaults for empty object", () => {
    const result = adminUsersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces string numbers", () => {
    const result = adminUsersQuerySchema.safeParse({ page: "3", limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("accepts optional search string", () => {
    const result = adminUsersQuerySchema.safeParse({ search: "john" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("john");
    }
  });

  it("rejects page = 0 (not positive)", () => {
    expect(adminUsersQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("rejects negative page", () => {
    expect(adminUsersQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
  });

  it("rejects limit > 100", () => {
    expect(adminUsersQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects search > 200 chars", () => {
    expect(
      adminUsersQuerySchema.safeParse({ search: "x".repeat(201) }).success
    ).toBe(false);
  });
});

describe("adminJobsQuerySchema", () => {
  it("provides defaults for empty object", () => {
    const result = adminJobsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces string numbers", () => {
    const result = adminJobsQuerySchema.safeParse({ page: "2", limit: "10" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it("accepts optional query string", () => {
    const result = adminJobsQuerySchema.safeParse({ q: "react developer" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe("react developer");
    }
  });

  it("rejects page = 0", () => {
    expect(adminJobsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("rejects limit > 100", () => {
    expect(adminJobsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects query > 200 chars", () => {
    expect(adminJobsQuerySchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
  });

  it("accepts boundary limit of 100", () => {
    const result = adminJobsQuerySchema.safeParse({ limit: "100" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100);
    }
  });
});

// ========================================================================
// Developer API Key
// ========================================================================

describe("createApiKeySchema", () => {
  it("accepts valid key with defaults", () => {
    const result = createApiKeySchema.safeParse({ name: "My Key" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scopes).toEqual(["read"]);
      expect(result.data.rateLimit).toBe(1000);
    }
  });

  it("accepts custom scopes and rate limit", () => {
    const result = createApiKeySchema.safeParse({
      name: "Admin Key",
      scopes: ["read", "write", "admin"],
      rateLimit: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createApiKeySchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects name > 100 chars", () => {
    expect(createApiKeySchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("rejects invalid scope", () => {
    expect(
      createApiKeySchema.safeParse({ name: "test", scopes: ["delete"] }).success
    ).toBe(false);
  });

  it("rejects rateLimit below minimum (100)", () => {
    expect(
      createApiKeySchema.safeParse({ name: "test", rateLimit: 99 }).success
    ).toBe(false);
  });

  it("rejects rateLimit above maximum (10000)", () => {
    expect(
      createApiKeySchema.safeParse({ name: "test", rateLimit: 10001 }).success
    ).toBe(false);
  });

  it("accepts boundary rateLimit 100", () => {
    const result = createApiKeySchema.safeParse({ name: "test", rateLimit: 100 });
    expect(result.success).toBe(true);
  });

  it("accepts boundary rateLimit 10000", () => {
    const result = createApiKeySchema.safeParse({ name: "test", rateLimit: 10000 });
    expect(result.success).toBe(true);
  });
});

// ========================================================================
// Enterprise API v1 Schemas
// ========================================================================

describe("jobsApiQuerySchema", () => {
  it("provides defaults for empty object", () => {
    const result = jobsApiQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it("accepts full query params", () => {
    const result = jobsApiQuerySchema.safeParse({
      q: "engineer",
      location: "NYC",
      remote: "true",
      salaryMin: "80000",
      salaryMax: "150000",
      skills: "react,node",
      limit: "50",
      offset: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remote).toBe(true);
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(10);
    }
  });

  it("rejects limit > 100", () => {
    expect(jobsApiQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects limit < 1", () => {
    expect(jobsApiQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("rejects negative offset", () => {
    expect(jobsApiQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
  });

  it("coerces remote string to boolean", () => {
    // Note: z.coerce.boolean() uses Boolean() coercion, so any non-empty
    // string (including "false") becomes true. Only empty string, 0, null,
    // undefined become false.
    const result = jobsApiQuerySchema.safeParse({ remote: "true" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remote).toBe(true);
    }
  });

  it("rejects q exceeding 500 chars", () => {
    expect(jobsApiQuerySchema.safeParse({ q: "x".repeat(501) }).success).toBe(false);
  });

  it("accepts q at boundary (500 chars)", () => {
    expect(jobsApiQuerySchema.safeParse({ q: "x".repeat(500) }).success).toBe(true);
  });

  it("rejects location exceeding 200 chars", () => {
    expect(jobsApiQuerySchema.safeParse({ location: "x".repeat(201) }).success).toBe(false);
  });

  it("accepts location at boundary (200 chars)", () => {
    expect(jobsApiQuerySchema.safeParse({ location: "x".repeat(200) }).success).toBe(true);
  });

  it("rejects salaryMin exceeding 10,000,000", () => {
    expect(jobsApiQuerySchema.safeParse({ salaryMin: "10000001" }).success).toBe(false);
  });

  it("rejects salaryMax exceeding 10,000,000", () => {
    expect(jobsApiQuerySchema.safeParse({ salaryMax: "10000001" }).success).toBe(false);
  });

  it("accepts salary values at boundary (0 and 10,000,000)", () => {
    const r1 = jobsApiQuerySchema.safeParse({ salaryMin: "0", salaryMax: "10000000" });
    expect(r1.success).toBe(true);
  });

  it("rejects negative salary values", () => {
    expect(jobsApiQuerySchema.safeParse({ salaryMin: "-1" }).success).toBe(false);
    expect(jobsApiQuerySchema.safeParse({ salaryMax: "-1" }).success).toBe(false);
  });

  it("rejects skills exceeding 500 chars", () => {
    expect(jobsApiQuerySchema.safeParse({ skills: "x".repeat(501) }).success).toBe(false);
  });

  it("accepts skills at boundary (500 chars)", () => {
    expect(jobsApiQuerySchema.safeParse({ skills: "x".repeat(500) }).success).toBe(true);
  });
});

describe("companiesApiQuerySchema", () => {
  it("provides defaults for empty object", () => {
    const result = companiesApiQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts query string", () => {
    const result = companiesApiQuerySchema.safeParse({ q: "Google" });
    expect(result.success).toBe(true);
  });

  it("rejects limit > 50", () => {
    expect(companiesApiQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
  });

  it("rejects limit < 1", () => {
    expect(companiesApiQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("accepts boundary limit of 50", () => {
    const result = companiesApiQuerySchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects q exceeding 200 chars", () => {
    expect(companiesApiQuerySchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
  });

  it("accepts q at boundary (200 chars)", () => {
    expect(companiesApiQuerySchema.safeParse({ q: "x".repeat(200) }).success).toBe(true);
  });
});

describe("salaryApiQuerySchema", () => {
  it("accepts required title", () => {
    const result = salaryApiQuerySchema.safeParse({ title: "Software Engineer" });
    expect(result.success).toBe(true);
  });

  it("accepts title with optional location and level", () => {
    const result = salaryApiQuerySchema.safeParse({
      title: "Product Manager",
      location: "San Francisco",
      level: "senior",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    expect(salaryApiQuerySchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(salaryApiQuerySchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("rejects title exceeding 200 chars", () => {
    expect(salaryApiQuerySchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
  });

  it("accepts title at boundary (200 chars)", () => {
    expect(salaryApiQuerySchema.safeParse({ title: "x".repeat(200) }).success).toBe(true);
  });

  it("rejects location exceeding 200 chars", () => {
    expect(
      salaryApiQuerySchema.safeParse({ title: "Engineer", location: "x".repeat(201) }).success
    ).toBe(false);
  });

  it("accepts location at boundary (200 chars)", () => {
    expect(
      salaryApiQuerySchema.safeParse({ title: "Engineer", location: "x".repeat(200) }).success
    ).toBe(true);
  });

  it("rejects level exceeding 100 chars", () => {
    expect(
      salaryApiQuerySchema.safeParse({ title: "Engineer", level: "x".repeat(101) }).success
    ).toBe(false);
  });

  it("accepts level at boundary (100 chars)", () => {
    expect(
      salaryApiQuerySchema.safeParse({ title: "Engineer", level: "x".repeat(100) }).success
    ).toBe(true);
  });
});

// ========================================================================
// Analytics
// ========================================================================

describe("analyticsDateRangeSchema", () => {
  it("provides default of 30 days", () => {
    const result = analyticsDateRangeSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(30);
    }
  });

  it("coerces string to number", () => {
    const result = analyticsDateRangeSchema.safeParse({ days: "7" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(7);
    }
  });

  it("rejects days < 1", () => {
    expect(analyticsDateRangeSchema.safeParse({ days: "0" }).success).toBe(false);
  });

  it("rejects days > 365", () => {
    expect(analyticsDateRangeSchema.safeParse({ days: "366" }).success).toBe(false);
  });

  it("accepts boundary value 1", () => {
    const result = analyticsDateRangeSchema.safeParse({ days: "1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(1);
    }
  });

  it("accepts boundary value 365", () => {
    const result = analyticsDateRangeSchema.safeParse({ days: "365" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(365);
    }
  });
});

// ========================================================================
// Organization Schemas
// ========================================================================

describe("createOrganizationSchema", () => {
  it("accepts name only (minimum required)", () => {
    const result = createOrganizationSchema.safeParse({ name: "Acme Corp" });
    expect(result.success).toBe(true);
  });

  it("accepts full organization data", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Acme Corp",
      logo: "https://example.com/logo.png",
      website: "https://acme.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createOrganizationSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects name > 100 chars", () => {
    expect(createOrganizationSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("accepts name at boundary (100 chars)", () => {
    expect(createOrganizationSchema.safeParse({ name: "x".repeat(100) }).success).toBe(true);
  });

  it("rejects invalid logo URL", () => {
    expect(
      createOrganizationSchema.safeParse({ name: "Acme", logo: "not-a-url" }).success
    ).toBe(false);
  });

  it("rejects invalid website URL", () => {
    expect(
      createOrganizationSchema.safeParse({ name: "Acme", website: "not-a-url" }).success
    ).toBe(false);
  });

  it("rejects missing name", () => {
    expect(createOrganizationSchema.safeParse({}).success).toBe(false);
  });

  it("rejects logo URL > 2048 chars", () => {
    expect(
      createOrganizationSchema.safeParse({
        name: "Acme",
        logo: "https://example.com/" + "x".repeat(2048),
      }).success
    ).toBe(false);
  });
});

describe("updateOrganizationSchema", () => {
  it("accepts empty object (all optional)", () => {
    expect(updateOrganizationSchema.safeParse({}).success).toBe(true);
  });

  it("accepts name update", () => {
    const result = updateOrganizationSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts nullable logo (to clear it)", () => {
    const result = updateOrganizationSchema.safeParse({ logo: null });
    expect(result.success).toBe(true);
  });

  it("accepts nullable website (to clear it)", () => {
    const result = updateOrganizationSchema.safeParse({ website: null });
    expect(result.success).toBe(true);
  });

  it("accepts valid logo URL", () => {
    const result = updateOrganizationSchema.safeParse({
      logo: "https://example.com/new-logo.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name string", () => {
    expect(updateOrganizationSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects name > 100 chars", () => {
    expect(
      updateOrganizationSchema.safeParse({ name: "x".repeat(101) }).success
    ).toBe(false);
  });

  it("rejects invalid logo URL", () => {
    expect(
      updateOrganizationSchema.safeParse({ logo: "not-a-url" }).success
    ).toBe(false);
  });
});

describe("inviteMemberSchema", () => {
  it("accepts valid email with default role", () => {
    const result = inviteMemberSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("member");
    }
  });

  it("accepts admin role", () => {
    const result = inviteMemberSchema.safeParse({
      email: "admin@example.com",
      role: "admin",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("admin");
    }
  });

  it("accepts member role explicitly", () => {
    const result = inviteMemberSchema.safeParse({
      email: "user@test.com",
      role: "member",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(inviteMemberSchema.safeParse({ email: "bad-email" }).success).toBe(false);
  });

  it("rejects email > 320 chars", () => {
    const longEmail = "a".repeat(310) + "@example.com";
    expect(inviteMemberSchema.safeParse({ email: longEmail }).success).toBe(false);
  });

  it("rejects invalid role", () => {
    expect(
      inviteMemberSchema.safeParse({ email: "u@e.com", role: "owner" }).success
    ).toBe(false);
  });

  it("rejects missing email", () => {
    expect(inviteMemberSchema.safeParse({}).success).toBe(false);
  });
});

describe("updateMemberRoleSchema", () => {
  it("accepts 'owner' role", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "owner" }).success).toBe(true);
  });

  it("accepts 'admin' role", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "admin" }).success).toBe(true);
  });

  it("accepts 'member' role", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "member" }).success).toBe(true);
  });

  it("rejects invalid role", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "superadmin" }).success).toBe(false);
  });

  it("rejects empty role", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "" }).success).toBe(false);
  });

  it("rejects missing role", () => {
    expect(updateMemberRoleSchema.safeParse({}).success).toBe(false);
  });
});

// ========================================================================
// Branding Configuration
// ========================================================================

describe("brandingConfigSchema", () => {
  it("accepts minimal config (name only required)", () => {
    const result = brandingConfigSchema.safeParse({ name: "My Brand" });
    expect(result.success).toBe(true);
  });

  it("accepts full branding config", () => {
    const result = brandingConfigSchema.safeParse({
      name: "Ever Jobs",
      logoUrl: "https://example.com/logo.png",
      faviconUrl: "https://example.com/favicon.ico",
      primaryColor: "#3b82f6",
      accentColor: "#f59e0b",
      tagline: "Find your dream job",
      customFooterHtml: "<p>Footer</p>",
      hideEverJobsBranding: true,
      customDomain: "jobs.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts nullable optional fields", () => {
    const result = brandingConfigSchema.safeParse({
      name: "Brand",
      logoUrl: null,
      faviconUrl: null,
      primaryColor: null,
      accentColor: null,
      tagline: null,
      customFooterHtml: null,
      customDomain: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(brandingConfigSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects name > 100 chars", () => {
    expect(brandingConfigSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("rejects invalid hex color for primaryColor", () => {
    expect(
      brandingConfigSchema.safeParse({ name: "B", primaryColor: "red" }).success
    ).toBe(false);
  });

  it("rejects 3-digit hex color", () => {
    expect(
      brandingConfigSchema.safeParse({ name: "B", primaryColor: "#f00" }).success
    ).toBe(false);
  });

  it("rejects hex without hash", () => {
    expect(
      brandingConfigSchema.safeParse({ name: "B", primaryColor: "3b82f6" }).success
    ).toBe(false);
  });

  it("rejects invalid hex color for accentColor", () => {
    expect(
      brandingConfigSchema.safeParse({ name: "B", accentColor: "not-hex" }).success
    ).toBe(false);
  });

  it("accepts valid 6-digit hex colors", () => {
    const result = brandingConfigSchema.safeParse({
      name: "B",
      primaryColor: "#000000",
      accentColor: "#ffffff",
    });
    expect(result.success).toBe(true);
  });

  it("accepts case-insensitive hex colors", () => {
    const result = brandingConfigSchema.safeParse({
      name: "B",
      primaryColor: "#aAbBcC",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid logo URL", () => {
    expect(
      brandingConfigSchema.safeParse({ name: "B", logoUrl: "not-url" }).success
    ).toBe(false);
  });

  it("rejects tagline > 200 chars", () => {
    expect(
      brandingConfigSchema.safeParse({ name: "B", tagline: "x".repeat(201) }).success
    ).toBe(false);
  });

  it("rejects customFooterHtml > 2000 chars", () => {
    expect(
      brandingConfigSchema.safeParse({ name: "B", customFooterHtml: "x".repeat(2001) }).success
    ).toBe(false);
  });

  it("rejects missing name", () => {
    expect(brandingConfigSchema.safeParse({}).success).toBe(false);
  });
});

// ========================================================================
// Organization AI Config
// ========================================================================

describe("orgAiConfigSchema", () => {
  it("accepts empty object (all optional)", () => {
    expect(orgAiConfigSchema.safeParse({}).success).toBe(true);
  });

  it("accepts full AI config", () => {
    const result = orgAiConfigSchema.safeParse({
      preferredModel: "claude-sonnet-4-20250514",
      customSystemPrompt: "You are a helpful recruiter assistant.",
      maxTokens: 4096,
      temperature: 0.7,
      enabledTools: ["searchJobs", "favoriteJob"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects customSystemPrompt > 5000 chars", () => {
    expect(
      orgAiConfigSchema.safeParse({ customSystemPrompt: "x".repeat(5001) }).success
    ).toBe(false);
  });

  it("rejects maxTokens < 100", () => {
    expect(orgAiConfigSchema.safeParse({ maxTokens: 99 }).success).toBe(false);
  });

  it("rejects maxTokens > 200000", () => {
    expect(orgAiConfigSchema.safeParse({ maxTokens: 200001 }).success).toBe(false);
  });

  it("accepts maxTokens at boundaries", () => {
    expect(orgAiConfigSchema.safeParse({ maxTokens: 100 }).success).toBe(true);
    expect(orgAiConfigSchema.safeParse({ maxTokens: 200000 }).success).toBe(true);
  });

  it("rejects temperature < 0", () => {
    expect(orgAiConfigSchema.safeParse({ temperature: -0.1 }).success).toBe(false);
  });

  it("rejects temperature > 1", () => {
    expect(orgAiConfigSchema.safeParse({ temperature: 1.1 }).success).toBe(false);
  });

  it("accepts temperature at boundaries", () => {
    expect(orgAiConfigSchema.safeParse({ temperature: 0 }).success).toBe(true);
    expect(orgAiConfigSchema.safeParse({ temperature: 1 }).success).toBe(true);
  });

  it("rejects enabledTools with > 50 items", () => {
    const tools = Array.from({ length: 51 }, (_, i) => `tool${i}`);
    expect(orgAiConfigSchema.safeParse({ enabledTools: tools }).success).toBe(false);
  });

  it("rejects tool name > 100 chars in enabledTools", () => {
    expect(
      orgAiConfigSchema.safeParse({ enabledTools: ["x".repeat(101)] }).success
    ).toBe(false);
  });

  it("rejects non-integer maxTokens", () => {
    expect(orgAiConfigSchema.safeParse({ maxTokens: 1000.5 }).success).toBe(false);
  });

  it("rejects preferredModel > 100 chars", () => {
    expect(
      orgAiConfigSchema.safeParse({ preferredModel: "x".repeat(101) }).success
    ).toBe(false);
  });
});
