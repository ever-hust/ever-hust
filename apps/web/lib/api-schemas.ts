import { z } from "zod";

// === Chat Route ===
export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(50_000),
        parts: z.array(z.object({ type: z.string().max(100) }).passthrough()).max(200).optional(),
      })
    )
    .max(100),
});

// === User Settings Route ===
export const settingsPatchSchema = z.object({
  name: z.string().max(200).optional(),
  headline: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  preferences: z
    .object({
      aiModel: z.string().max(100).optional(),
      apiKeys: z
        .object({
          anthropic: z.string().max(500).optional(),
          openai: z.string().max(500).optional(),
          google: z.string().max(500).optional(),
        })
        .optional(),
    })
    .strict()
    .optional(),
});

// === User Alerts Route ===
export const alertCreateSchema = z.object({
  frequency: z.enum(["daily", "twice_daily", "weekly"]),
  email: z.string().email().max(320),
  criteria: z
    .object({
      keywords: z.array(z.string().max(200)).max(20).optional(),
      locations: z.array(z.string().max(200)).max(10).optional(),
      remoteType: z.string().max(50).optional(),
      salary: z
        .object({
          min: z.number().int().min(0).max(10_000_000).optional(),
          max: z.number().int().min(0).max(10_000_000).optional(),
        })
        .optional(),
      skills: z.array(z.string().max(100)).max(30).optional(),
      roleLevel: z.array(z.string().max(50)).max(10).optional(),
      industries: z.array(z.string().max(200)).max(20).optional(),
    })
    .optional(),
});

export const alertPatchSchema = z.object({
  id: z.number().int().positive(),
  isActive: z.boolean().optional(),
  frequency: z.enum(["daily", "twice_daily", "weekly"]).optional(),
  email: z.string().email().max(320).optional(),
  // Reuse the same criteria shape as alertCreateSchema for consistency
  criteria: alertCreateSchema.shape.criteria,
});

export type AlertCriteria = z.infer<typeof alertCreateSchema>["criteria"];

export const alertDeleteSchema = z.object({
  id: z.number().int().positive(),
});

// === Profile PATCH Route ===
export const profilePatchSchema = z.object({
  name: z.string().max(200).optional(),
  headline: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  skills: z.array(z.string().max(100)).max(50).optional(),
  experience: z
    .array(
      z.object({
        title: z.string().max(200),
        company: z.string().max(200),
        location: z.string().max(200).optional(),
        startDate: z.string().max(50).optional(),
        endDate: z.string().max(50).optional(),
        current: z.boolean().optional(),
        description: z.string().max(2000).optional(),
      })
    )
    .max(20)
    .optional(),
  onboardingCompleted: z.boolean().optional(),
});

// === Stripe Checkout Route ===
export const checkoutSchema = z.object({
  planId: z.enum(["monthly", "quarterly", "annual"]),
});

// === Favorites Route ===
export const favoriteToggleSchema = z.object({
  jobId: z.number().int().positive(),
});

// === Job Search Query Params ===
export const jobSearchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  keywords: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  isRemote: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  jobType: z.string().max(50).optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
  salaryMax: z.coerce.number().int().min(0).optional(),
});

// === User Preferences (stored as JSONB, shared by multiple routes) ===
export const userPreferencesSchema = z.object({
  /** Desired job types (fulltime, parttime, contract, internship) */
  jobTypes: z.array(z.string().max(50)).max(10).optional(),
  /** Desired salary range */
  salaryMin: z.number().int().min(0).max(10_000_000).optional(),
  salaryMax: z.number().int().min(0).max(10_000_000).optional(),
  salaryCurrency: z.string().max(10).default("USD").optional(),
  /** Preferred industries */
  industries: z.array(z.string().max(200)).max(20).optional(),
  /** Role level (junior, mid, senior, lead, manager, executive) */
  roleLevel: z.array(z.string().max(50)).max(10).optional(),
  /** Preferred locations */
  locations: z.array(z.string().max(200)).max(20).optional(),
  /** Remote preference */
  remotePreference: z.enum(["remote", "hybrid", "onsite", "any"]).optional(),
  /** Key skills */
  skills: z.array(z.string().max(100)).max(50).optional(),
  /** Company size preference */
  companySizes: z.array(z.enum(["startup", "small", "medium", "large", "enterprise"])).optional(),
  /** Job search timeline */
  timeline: z.enum(["immediately", "1-2-weeks", "1-month", "just-exploring"]).optional(),
  /** Things to avoid / deal-breakers */
  dealBreakers: z.array(z.string().max(200)).max(10).optional(),
  /** AI model preference */
  aiModel: z.string().max(100).optional(),
  /** BYOK API keys */
  apiKeys: z
    .object({
      anthropic: z.string().max(500).optional(),
      openai: z.string().max(500).optional(),
      google: z.string().max(500).optional(),
    })
    .optional(),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

// === CV Parsed Data (stored as JSONB in user.cvParsedData) ===
export const cvParsedDataSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
  experience: z.array(z.object({
    company: z.string(),
    title: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })).optional(),
  rawText: z.string().optional(),
});

export type CVParsedData = z.infer<typeof cvParsedDataSchema>;

// === Push Subscription Route ===
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

// === Referral Program Routes ===
export const referralInviteSchema = z.object({
  email: z.string().email().max(320),
});

export const referralRedeemSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/, "Invalid referral code format"),
});

// === Admin Routes ===
export const updateUserRoleSchema = z.object({
  role: z.enum(["user", "recruiter", "admin"]),
});

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

// === Developer API Key Routes ===
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(["read", "write", "admin"])).default(["read"]),
  rateLimit: z.number().int().min(100).max(10000).default(1000),
});

// === Enterprise API v1 Routes ===
export const jobsApiQuerySchema = z.object({
  q: z.string().optional(),
  location: z.string().optional(),
  remote: z.coerce.boolean().optional(),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  skills: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const companiesApiQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const salaryApiQuerySchema = z.object({
  title: z.string().min(1),
  location: z.string().optional(),
  level: z.string().optional(),
});

// === Analytics Routes ===
export const analyticsDateRangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// === Organization Routes ===
export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  logo: z.string().url().max(2048).optional(),
  website: z.string().url().max(2048).optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logo: z.string().url().max(2048).optional().nullable(),
  website: z.string().url().max(2048).optional().nullable(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member"]).default("member"),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});

// === Branding Configuration ===
const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

export const brandingConfigSchema = z.object({
  name: z.string().min(1).max(100),
  logoUrl: z.string().url().max(2048).optional().nullable(),
  faviconUrl: z.string().url().max(2048).optional().nullable(),
  primaryColor: z
    .string()
    .regex(hexColorRegex, "Must be a hex color (e.g. #3b82f6)")
    .optional()
    .nullable(),
  accentColor: z
    .string()
    .regex(hexColorRegex, "Must be a hex color (e.g. #3b82f6)")
    .optional()
    .nullable(),
  tagline: z.string().max(200).optional().nullable(),
  customFooterHtml: z.string().max(2000).optional().nullable(),
  hideEverJobsBranding: z.boolean().optional(),
  customDomain: z.string().max(200).optional().nullable(),
});

export type BrandingConfig = z.infer<typeof brandingConfigSchema>;

// === Organization AI Config Route ===
export const orgAiConfigSchema = z.object({
  preferredModel: z.string().max(100).optional(),
  customSystemPrompt: z.string().max(5000).optional(),
  maxTokens: z.number().int().min(100).max(200_000).optional(),
  temperature: z.number().min(0).max(1).optional(),
  enabledTools: z.array(z.string().max(100)).max(50).optional(),
});

export type OrgAiConfig = z.infer<typeof orgAiConfigSchema>;

// === Helper to safely parse and return 400 on failure ===
export function parseBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { success: false, error: messages };
  }
  return { success: true, data: result.data };
}
