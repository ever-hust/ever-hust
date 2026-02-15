import { ScraperInputSchema, SiteEnum, JobTypeEnum } from "./types";

describe("ScraperInputSchema", () => {
  it("should accept valid input", () => {
    const result = ScraperInputSchema.parse({
      searchTerm: "software engineer",
      location: "San Francisco",
      isRemote: true,
    });
    expect(result.searchTerm).toBe("software engineer");
    expect(result.location).toBe("San Francisco");
    expect(result.isRemote).toBe(true);
  });

  it("should apply defaults", () => {
    const result = ScraperInputSchema.parse({});
    expect(result.distance).toBe(50);
    expect(result.resultsWanted).toBe(15);
    expect(result.country).toBe("USA");
  });

  it("should accept valid site types", () => {
    const result = ScraperInputSchema.parse({
      siteType: ["linkedin", "indeed", "glassdoor"],
    });
    expect(result.siteType).toEqual(["linkedin", "indeed", "glassdoor"]);
  });

  it("should reject invalid site types", () => {
    expect(() =>
      ScraperInputSchema.parse({
        siteType: ["invalidsite"],
      })
    ).toThrow();
  });

  it("should accept valid job types", () => {
    const result = ScraperInputSchema.parse({
      jobType: ["fulltime", "contract"],
    });
    expect(result.jobType).toEqual(["fulltime", "contract"]);
  });
});

describe("SiteEnum", () => {
  it("should include major job boards", () => {
    expect(SiteEnum.options).toContain("linkedin");
    expect(SiteEnum.options).toContain("indeed");
    expect(SiteEnum.options).toContain("glassdoor");
  });
});

describe("JobTypeEnum", () => {
  it("should include standard job types", () => {
    expect(JobTypeEnum.options).toContain("fulltime");
    expect(JobTypeEnum.options).toContain("parttime");
    expect(JobTypeEnum.options).toContain("contract");
    expect(JobTypeEnum.options).toContain("internship");
  });
});
