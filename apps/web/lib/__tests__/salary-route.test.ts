/**
 * GET /api/v1/salary: the statistics must cover one currency only. Before
 * this, 3 USD postings near 120,000 and 2 INR postings near 2,000,000 were
 * averaged together and labelled USD (max 2,000,000, sampleSize 5).
 */
jest.mock("drizzle-orm", () => ({
  and: jest.fn(),
  ilike: jest.fn(),
  isNotNull: jest.fn(),
  or: jest.fn(),
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
jest.mock("../api-key-auth", () => ({
  validateApiKey: async () => ({
    userId: "user-1",
    keyId: 1,
    scopes: ["read"],
    rateLimit: 100,
  }),
}));
jest.mock("../get-session-user", () => ({ getSessionUser: async () => null }));
jest.mock("../rate-limit", () => ({
  checkApiRateLimit: () => ({
    allowed: true,
    remaining: 99,
    resetAt: Date.now() + 60_000,
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "../../app/api/v1/salary/route";

/** A jobs row as the DB returns it (numeric columns come back as strings). */
function job(
  salaryMin: string,
  salaryMax: string,
  salaryCurrency: string | null,
) {
  return {
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryInterval: "yearly",
    jobLevel: "senior",
    isRemote: true,
    companyName: "Acme",
  };
}

interface SalaryResponse {
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
}

async function getSalary(): Promise<SalaryResponse> {
  const res = await GET(
    new NextRequest("http://localhost/api/v1/salary?title=Software%20Engineer"),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as SalaryResponse;
}

describe("GET /api/v1/salary currency handling", () => {
  it("reports only the USD postings when 3 are USD and 2 are INR", async () => {
    mockRows = [
      job("110000", "120000", "USD"),
      job("1900000", "2000000", "INR"),
      job("115000", "120000", "USD"),
      job("2000000", "2000000", "INR"),
      job("120000", "120000", "USD"),
    ];

    const body = await getSalary();

    expect(body.currency).toBe("USD");
    expect(body.sampleSize).toBe(3);
    expect(body.excludedOtherCurrency).toBe(2);
    expect(body.overall).toEqual({
      median: 117_500,
      average: 117_500,
      min: 110_000,
      max: 120_000,
      p25: 115_000,
      p75: 120_000,
    });
    expect(body.byLevel).toEqual([
      expect.objectContaining({ level: "senior", count: 3, max: 120_000 }),
    ]);
  });

  it("counts postings with no currency as USD", async () => {
    mockRows = [
      job("100000", "100000", null),
      job("100000", "100000", "usd"),
      job("3000000", "3000000", "INR"),
    ];

    const body = await getSalary();

    expect(body.currency).toBe("USD");
    expect(body.sampleSize).toBe(2);
    expect(body.excludedOtherCurrency).toBe(1);
    expect(body.overall.max).toBe(100_000);
  });
});
