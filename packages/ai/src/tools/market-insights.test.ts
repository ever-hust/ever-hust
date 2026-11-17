jest.mock("drizzle-orm", () => ({
  and: jest.fn(),
  ilike: jest.fn(),
  or: jest.fn(),
}));

// Rows returned by `db.select(...).from(jobs).where(...).limit(800)`, and the
// column selection the tool passed to `db.select`.
let mockRows: Record<string, unknown>[] = [];
let mockSelection: Record<string, unknown> | undefined;

jest.mock("@ever-hust/db", () => ({
  db: {
    select: (selection: Record<string, unknown>) => {
      mockSelection = selection;
      return {
        from: () => ({
          where: () => ({
            limit: async () => mockRows,
          }),
        }),
      };
    },
  },
  // Each column is a marker string, so a test can see which columns were selected.
  jobs: {
    title: "jobs.title",
    skills: "jobs.skills",
    salaryMin: "jobs.salaryMin",
    salaryMax: "jobs.salaryMax",
    salaryCurrency: "jobs.salaryCurrency",
    salaryInterval: "jobs.salaryInterval",
    isRemote: "jobs.isRemote",
    locationCity: "jobs.locationCity",
    locationState: "jobs.locationState",
    locationCountry: "jobs.locationCountry",
    jobLevel: "jobs.jobLevel",
    companyName: "jobs.companyName",
  },
  escapeIlike: (value: string) => value,
}));

import {
  computeMarketInsights,
  marketInsightsTool,
  type MarketJob,
} from "./market-insights";

function job(overrides: Partial<MarketJob> = {}): MarketJob {
  return {
    skills: ["TypeScript", "React"],
    salaryMin: 120000,
    salaryMax: 160000,
    salaryInterval: "yearly",
    salaryCurrency: "USD",
    isRemote: true,
    locationCity: "Austin",
    locationState: "TX",
    jobLevel: "Senior",
    companyName: "Acme",
    ...overrides,
  };
}

/** A posting that pays exactly `pay` per year in `currency`. */
function paid(pay: number, currency: string | null, overrides: Partial<MarketJob> = {}): MarketJob {
  return job({ salaryMin: pay, salaryMax: pay, salaryCurrency: currency, ...overrides });
}

describe("computeMarketInsights", () => {
  it("counts demand and computes remote share over known work-modes", () => {
    const rows = [
      job({ isRemote: true }),
      job({ isRemote: false }),
      job({ isRemote: null }), // unknown — excluded from the %
    ];
    const r = computeMarketInsights(rows);
    expect(r.demandCount).toBe(3);
    expect(r.remotePct).toBe(50); // 1 of 2 known
  });

  it("ranks the most in-demand skills", () => {
    const rows = [
      job({ skills: ["TypeScript", "React"] }),
      job({ skills: ["TypeScript", "Go"] }),
      job({ skills: ["TypeScript"] }),
    ];
    const r = computeMarketInsights(rows);
    expect(r.topSkills[0]).toEqual({ skill: "TypeScript", count: 3 });
  });

  it("computes a salary spread over annualised midpoints", () => {
    const rows = [
      job({ salaryMin: 100000, salaryMax: 100000 }),
      job({ salaryMin: 150000, salaryMax: 150000 }),
      job({ salaryMin: 200000, salaryMax: 200000 }),
    ];
    const r = computeMarketInsights(rows);
    expect(r.salary?.sampleSize).toBe(3);
    expect(r.salary?.median).toBe(150000);
  });

  it("annualises hourly pay before aggregating", () => {
    const rows = [job({ salaryMin: 100, salaryMax: 100, salaryInterval: "hourly" })];
    const r = computeMarketInsights(rows);
    expect(r.salary?.median).toBe(208000); // 100 * 2080
  });

  it("returns null salary when no pay data is present", () => {
    const rows = [job({ salaryMin: null, salaryMax: null })];
    expect(computeMarketInsights(rows).salary).toBeNull();
  });

  it("ranks top locations and companies", () => {
    const rows = [
      job({ locationCity: "Austin", locationState: "TX", companyName: "Acme" }),
      job({ locationCity: "Austin", locationState: "TX", companyName: "Globex" }),
      job({ locationCity: "Remote", locationState: null, companyName: "Acme" }),
    ];
    const r = computeMarketInsights(rows);
    expect(r.topLocations[0]).toEqual({ location: "Austin, TX", count: 2 });
    expect(r.topCompanies[0]).toEqual({ company: "Acme", count: 2 });
  });
});

// The salary spread must come from one currency only. Before this, 3 USD
// postings near 150,000 and 2 INR postings near 2,000,000 went into one sorted
// list and came back as a median of 200,000 with no currency at all.
describe("computeMarketInsights currency handling", () => {
  it("computes the salary spread over the dominant currency only", () => {
    const rows = [
      paid(100000, "USD", { companyName: "Acme" }),
      paid(1800000, "INR", { companyName: "Initech" }),
      paid(150000, "USD", { companyName: "Acme" }),
      paid(2400000, "INR", { companyName: "Initech" }),
      paid(200000, "USD", { companyName: "Globex" }),
    ];

    const r = computeMarketInsights(rows);

    expect(r.salary).toEqual({
      median: 150000,
      p25: 100000,
      p75: 200000,
      sampleSize: 3,
      currency: "USD",
      excludedOtherCurrency: 2,
    });
    // Only the salary spread is limited to one currency: demand and the
    // rankings still count every posting.
    expect(r.demandCount).toBe(5);
    expect(r.topCompanies).toEqual(
      expect.arrayContaining([{ company: "Initech", count: 2 }]),
    );
  });

  it("reports INR when most postings with pay are in INR", () => {
    const rows = [
      paid(1500000, "INR"),
      paid(120000, "USD"),
      paid(2000000, "inr"),
      paid(2500000, "INR"),
    ];

    expect(computeMarketInsights(rows).salary).toEqual({
      median: 2000000,
      p25: 1500000,
      p75: 2500000,
      sampleSize: 3,
      currency: "INR",
      excludedOtherCurrency: 1,
    });
  });

  it("counts a null currency as USD", () => {
    const rows = [
      paid(100000, "USD"),
      paid(120000, null),
      paid(1800000, "INR"),
      paid(140000, null),
      paid(2400000, "INR"),
    ];

    expect(computeMarketInsights(rows).salary).toEqual({
      median: 120000,
      p25: 100000,
      p75: 140000,
      sampleSize: 3,
      currency: "USD",
      excludedOtherCurrency: 2,
    });
  });

  it("picks the currency from the postings that have pay figures", () => {
    // Three INR postings without any pay must not make INR the currency of
    // the two USD figures.
    const rows = [
      job({ salaryMin: null, salaryMax: null, salaryCurrency: "INR" }),
      job({ salaryMin: null, salaryMax: null, salaryCurrency: "INR" }),
      job({ salaryMin: null, salaryMax: null, salaryCurrency: "INR" }),
      paid(100000, "USD"),
      paid(140000, "USD"),
    ];

    expect(computeMarketInsights(rows).salary).toEqual({
      median: 120000,
      p25: 100000,
      p75: 140000,
      sampleSize: 2,
      currency: "USD",
      excludedOtherCurrency: 0,
    });
  });
});

describe("marketInsightsTool", () => {
  /** A jobs row as the DB returns it (numeric columns come back as strings). */
  function dbRow(pay: string, salaryCurrency: string | null) {
    return {
      skills: ["TypeScript"],
      salaryMin: pay,
      salaryMax: pay,
      salaryCurrency,
      salaryInterval: "yearly",
      isRemote: true,
      locationCity: null,
      locationState: null,
      jobLevel: "senior",
      companyName: "Acme",
    };
  }

  beforeEach(() => {
    mockSelection = undefined;
    mockRows = [
      dbRow("100000", "USD"),
      dbRow("2000000", "INR"),
      dbRow("150000", "USD"),
      dbRow("2400000", "INR"),
      dbRow("200000", "USD"),
    ];
  });

  it("selects salary_currency and returns the currency with the salary spread", async () => {
    const result = (await marketInsightsTool.execute!(
      { role: "Software Engineer" },
      { toolCallId: "t1", messages: [] },
    )) as { demandCount: number; salary: unknown };

    expect(mockSelection).toEqual(
      expect.objectContaining({ salaryCurrency: "jobs.salaryCurrency" }),
    );
    expect(result.demandCount).toBe(5);
    expect(result.salary).toEqual({
      median: 150000,
      p25: 100000,
      p75: 200000,
      sampleSize: 3,
      currency: "USD",
      excludedOtherCurrency: 2,
    });
  });
});
