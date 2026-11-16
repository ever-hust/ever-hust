// The salary insights tool must compute its statistics over one currency only.
// Before this, 3 USD postings near 120,000 and 2 INR postings near 2,000,000
// were averaged together and reported as USD (max 2,000,000, sampleSize 5).

jest.mock("drizzle-orm", () => ({
  and: jest.fn(),
  eq: jest.fn(),
  ilike: jest.fn(),
  isNotNull: jest.fn(),
  or: jest.fn(),
  sql: jest.fn(),
}));

// Rows returned by `db.select(...).from(jobs).where(...).limit(500)`.
let mockRows: Record<string, unknown>[] = [];

jest.mock("@ever-hust/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mockRows,
        }),
      }),
    }),
  },
  jobs: {},
  escapeIlike: (value: string) => value,
}));

import { salaryInsightsTool } from "./salary-insights";

/** A jobs row as the DB returns it (numeric columns come back as strings). */
function job(
  id: number,
  salaryMin: string,
  salaryMax: string,
  salaryCurrency: string | null,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    title: "Software Engineer",
    companyName: `Company ${id}`,
    locationCity: null,
    locationState: null,
    locationCountry: null,
    isRemote: true,
    jobLevel: "senior",
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryInterval: "yearly",
    ...extra,
  };
}

/** 3 USD postings near 120,000 and 2 INR postings near 2,000,000. */
const MIXED_ROWS = [
  job(1, "110000", "120000", "USD"),
  job(2, "1900000", "2000000", "INR", { isRemote: false }),
  job(3, "115000", "120000", "USD"),
  job(4, "2000000", "2000000", "INR", { isRemote: false }),
  job(5, "120000", "120000", "USD"),
];

interface SalaryResult {
  sampleSize: number;
  currency: string;
  excludedOtherCurrency: number;
  overall: {
    median: number;
    average: number;
    min: number;
    max: number;
    p25: number;
    p75: number;
  };
  byLevel: { level: string; count: number; max: number }[];
  byWorkMode: {
    remote: { count: number };
    onSite: { count: number };
  };
  topCompanies: { company: string; medianSalary: number }[];
}

async function runTool(): Promise<SalaryResult> {
  return (await salaryInsightsTool.execute!(
    { jobTitle: "Software Engineer" },
    { toolCallId: "t1", messages: [] },
  )) as SalaryResult;
}

describe("salaryInsightsTool currency handling", () => {
  beforeEach(() => {
    mockRows = MIXED_ROWS;
  });

  it("reports only the USD postings when 3 are USD and 2 are INR", async () => {
    const result = await runTool();

    expect(result.currency).toBe("USD");
    expect(result.sampleSize).toBe(3);
    expect(result.excludedOtherCurrency).toBe(2);
    expect(result.overall).toEqual({
      median: 117_500,
      average: 117_500,
      min: 110_000,
      max: 120_000,
      p25: 115_000,
      p75: 120_000,
    });
  });

  it("keeps the INR postings out of the level, work-mode and company breakdowns", async () => {
    const result = await runTool();

    expect(result.byLevel).toEqual([
      expect.objectContaining({ level: "senior", count: 3, max: 120_000 }),
    ]);
    expect(result.byWorkMode.remote.count).toBe(3);
    expect(result.byWorkMode.onSite.count).toBe(0);
    expect(result.topCompanies.map((c) => c.company).sort()).toEqual([
      "Company 1",
      "Company 3",
      "Company 5",
    ]);
  });

  it("excludes nothing when every posting uses one currency", async () => {
    mockRows = [
      job(1, "100000", "110000", "EUR"),
      job(2, "90000", "100000", "eur"),
    ];

    const result = await runTool();

    expect(result.currency).toBe("EUR");
    expect(result.sampleSize).toBe(2);
    expect(result.excludedOtherCurrency).toBe(0);
  });
});
