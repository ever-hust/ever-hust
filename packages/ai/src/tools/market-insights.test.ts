import { computeMarketInsights, type MarketJob } from "./market-insights";

function job(overrides: Partial<MarketJob> = {}): MarketJob {
  return {
    skills: ["TypeScript", "React"],
    salaryMin: 120000,
    salaryMax: 160000,
    salaryInterval: "yearly",
    isRemote: true,
    locationCity: "Austin",
    locationState: "TX",
    jobLevel: "Senior",
    companyName: "Acme",
    ...overrides,
  };
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
