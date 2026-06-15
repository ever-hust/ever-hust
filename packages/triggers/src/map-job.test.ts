import type { JobPostDto } from "@ever-hust/jobs-api";
import { mapJobToDb, SEARCH_TERMS } from "./map-job";

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

function makeDto(overrides: Partial<JobPostDto> = {}): JobPostDto {
  return {
    id: "ext_123",
    site: "linkedin",
    title: "Software Engineer",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SEARCH_TERMS
// ---------------------------------------------------------------------------

describe("SEARCH_TERMS", () => {
  it("contains a non-empty array of strings", () => {
    expect(Array.isArray(SEARCH_TERMS)).toBe(true);
    expect(SEARCH_TERMS.length).toBeGreaterThan(0);
    for (const term of SEARCH_TERMS) {
      expect(typeof term).toBe("string");
      expect(term.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate entries", () => {
    const unique = new Set(SEARCH_TERMS.map((t) => t.toLowerCase()));
    expect(unique.size).toBe(SEARCH_TERMS.length);
  });

  it("covers all major job categories", () => {
    const joined = SEARCH_TERMS.join(" ").toLowerCase();
    // Engineering
    expect(joined).toContain("software engineer");
    expect(joined).toContain("frontend developer");
    expect(joined).toContain("backend developer");
    // Data & AI
    expect(joined).toContain("data scientist");
    expect(joined).toContain("machine learning");
    // Product & Design
    expect(joined).toContain("product manager");
    expect(joined).toContain("ux designer");
    // Leadership
    expect(joined).toContain("engineering manager");
    expect(joined).toContain("cto");
  });
});

// ---------------------------------------------------------------------------
// mapJobToDb – required fields
// ---------------------------------------------------------------------------

describe("mapJobToDb", () => {
  describe("required fields", () => {
    it("maps id, site, and title directly", () => {
      const result = mapJobToDb(makeDto());

      expect(result.externalId).toBe("ext_123");
      expect(result.site).toBe("linkedin");
      expect(result.title).toBe("Software Engineer");
    });
  });

  // -------------------------------------------------------------------------
  // Optional string fields default to null
  // -------------------------------------------------------------------------

  describe("optional string fields default to null", () => {
    const fields = [
      "companyName",
      "companyUrl",
      "companyLogo",
      "jobUrl",
      "jobUrlDirect",
      "applyUrl",
      "description",
      "department",
      "team",
      "employmentType",
      "jobLevel",
      "jobFunction",
      "companyIndustry",
      "companyNumEmployees",
      "companyDescription",
    ] as const;

    it.each(fields)("sets %s to null when not present in DTO", (field) => {
      const result = mapJobToDb(makeDto());
      // All mapped fields should be null (db column key might differ from DTO key)
      const dbResult = result as Record<string, unknown>;
      // Map DTO fields to DB column names
      const dbKey =
        field === "companyName"
          ? "companyName"
          : field === "companyUrl"
            ? "companyUrl"
            : field === "companyLogo"
              ? "companyLogo"
              : field === "companyDescription"
                ? "companyDescription"
                : field === "companyIndustry"
                  ? "companyIndustry"
                  : field === "companyNumEmployees"
                    ? "companyNumEmployees"
                    : field;
      expect(dbResult[dbKey]).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Optional string fields mapped when present
  // -------------------------------------------------------------------------

  describe("optional string fields mapped when present", () => {
    it("maps companyName", () => {
      const result = mapJobToDb(makeDto({ companyName: "Acme Corp" }));
      expect(result.companyName).toBe("Acme Corp");
    });

    it("maps companyUrl", () => {
      const result = mapJobToDb(
        makeDto({ companyUrl: "https://acme.com" })
      );
      expect(result.companyUrl).toBe("https://acme.com");
    });

    it("maps jobUrl and applyUrl", () => {
      const result = mapJobToDb(
        makeDto({
          jobUrl: "https://jobs.acme.com/123",
          applyUrl: "https://apply.acme.com/123",
        })
      );
      expect(result.jobUrl).toBe("https://jobs.acme.com/123");
      expect(result.applyUrl).toBe("https://apply.acme.com/123");
    });

    it("maps description", () => {
      const result = mapJobToDb(makeDto({ description: "Great job!" }));
      expect(result.description).toBe("Great job!");
    });
  });

  // -------------------------------------------------------------------------
  // Location mapping
  // -------------------------------------------------------------------------

  describe("location mapping", () => {
    it("maps all location fields from nested DTO structure", () => {
      const result = mapJobToDb(
        makeDto({
          location: {
            city: "San Francisco",
            state: "CA",
            country: "US",
          },
        })
      );

      expect(result.locationCity).toBe("San Francisco");
      expect(result.locationState).toBe("CA");
      expect(result.locationCountry).toBe("US");
    });

    it("defaults all location fields to null when location is undefined", () => {
      const result = mapJobToDb(makeDto());

      expect(result.locationCity).toBeNull();
      expect(result.locationState).toBeNull();
      expect(result.locationCountry).toBeNull();
    });

    it("handles partial location (city only)", () => {
      const result = mapJobToDb(
        makeDto({ location: { city: "Berlin" } })
      );

      expect(result.locationCity).toBe("Berlin");
      expect(result.locationState).toBeNull();
      expect(result.locationCountry).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Boolean fields
  // -------------------------------------------------------------------------

  describe("isRemote", () => {
    it("defaults to false when not provided", () => {
      const result = mapJobToDb(makeDto());
      expect(result.isRemote).toBe(false);
    });

    it("maps true when isRemote is true", () => {
      const result = mapJobToDb(makeDto({ isRemote: true }));
      expect(result.isRemote).toBe(true);
    });

    it("maps false when isRemote is explicitly false", () => {
      const result = mapJobToDb(makeDto({ isRemote: false }));
      expect(result.isRemote).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Array fields
  // -------------------------------------------------------------------------

  describe("array fields", () => {
    it("defaults jobType to empty array", () => {
      const result = mapJobToDb(makeDto());
      expect(result.jobType).toEqual([]);
    });

    it("maps jobType array", () => {
      const result = mapJobToDb(
        makeDto({ jobType: ["fulltime", "contract"] })
      );
      expect(result.jobType).toEqual(["fulltime", "contract"]);
    });

    it("defaults skills to empty array", () => {
      const result = mapJobToDb(makeDto());
      expect(result.skills).toEqual([]);
    });

    it("maps skills array", () => {
      const result = mapJobToDb(
        makeDto({ skills: ["React", "TypeScript", "Node.js"] })
      );
      expect(result.skills).toEqual(["React", "TypeScript", "Node.js"]);
    });
  });

  // -------------------------------------------------------------------------
  // Compensation / salary mapping
  // -------------------------------------------------------------------------

  describe("compensation mapping", () => {
    it("defaults all salary fields to null when compensation is undefined", () => {
      const result = mapJobToDb(makeDto());

      expect(result.salaryMin).toBeNull();
      expect(result.salaryMax).toBeNull();
      expect(result.salaryCurrency).toBeNull();
      expect(result.salaryInterval).toBeNull();
    });

    it("converts minAmount and maxAmount to strings", () => {
      const result = mapJobToDb(
        makeDto({
          compensation: {
            minAmount: 80000,
            maxAmount: 120000,
            currency: "USD",
            interval: "yearly",
          },
        })
      );

      expect(result.salaryMin).toBe("80000");
      expect(result.salaryMax).toBe("120000");
      expect(result.salaryCurrency).toBe("USD");
      expect(result.salaryInterval).toBe("yearly");
    });

    it("handles partial compensation (min only)", () => {
      const result = mapJobToDb(
        makeDto({
          compensation: { minAmount: 50000 },
        })
      );

      expect(result.salaryMin).toBe("50000");
      expect(result.salaryMax).toBeNull();
      expect(result.salaryCurrency).toBeNull();
      expect(result.salaryInterval).toBeNull();
    });

    it("handles zero salary amounts", () => {
      const result = mapJobToDb(
        makeDto({
          compensation: { minAmount: 0, maxAmount: 0 },
        })
      );

      expect(result.salaryMin).toBe("0");
      expect(result.salaryMax).toBe("0");
    });

    it("handles fractional salary amounts", () => {
      const result = mapJobToDb(
        makeDto({
          compensation: { minAmount: 25.5, maxAmount: 50.75 },
        })
      );

      expect(result.salaryMin).toBe("25.5");
      expect(result.salaryMax).toBe("50.75");
    });

    it("returns null for NaN salary amounts", () => {
      const result = mapJobToDb(
        makeDto({
          compensation: { minAmount: NaN, maxAmount: NaN },
        })
      );

      expect(result.salaryMin).toBeNull();
      expect(result.salaryMax).toBeNull();
    });

    it("returns null for Infinity salary amounts", () => {
      const result = mapJobToDb(
        makeDto({
          compensation: { minAmount: Infinity, maxAmount: -Infinity },
        })
      );

      expect(result.salaryMin).toBeNull();
      expect(result.salaryMax).toBeNull();
    });

    it("rejects negative salary amounts", () => {
      const result = mapJobToDb(
        makeDto({
          compensation: { minAmount: -100, maxAmount: -50 },
        })
      );

      // Negative salary values are invalid data quality — discard them
      expect(result.salaryMin).toBeNull();
      expect(result.salaryMax).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Date handling
  // -------------------------------------------------------------------------

  describe("datePosted", () => {
    it("converts ISO string to Date object", () => {
      const result = mapJobToDb(
        makeDto({ datePosted: "2024-03-15T10:00:00Z" })
      );

      expect(result.datePosted).toBeInstanceOf(Date);
      expect(result.datePosted!.toISOString()).toBe("2024-03-15T10:00:00.000Z");
    });

    it("returns null when datePosted is undefined", () => {
      const result = mapJobToDb(makeDto());
      expect(result.datePosted).toBeNull();
    });

    it("handles date-only strings", () => {
      const result = mapJobToDb(makeDto({ datePosted: "2024-03-15" }));

      expect(result.datePosted).toBeInstanceOf(Date);
      // Date-only strings are interpreted as UTC midnight
      expect(result.datePosted!.getFullYear()).toBe(2024);
    });

    it("returns null for invalid date strings", () => {
      const result = mapJobToDb(makeDto({ datePosted: "not-a-date" }));
      expect(result.datePosted).toBeNull();
    });

    it("returns null for empty date string", () => {
      const result = mapJobToDb(makeDto({ datePosted: "" }));
      expect(result.datePosted).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // expiresAt
  // -------------------------------------------------------------------------

  describe("expiresAt", () => {
    it("converts an ISO expiresAt to a Date", () => {
      const result = mapJobToDb(makeDto({ expiresAt: "2024-05-01T00:00:00Z" }));
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt!.toISOString()).toBe("2024-05-01T00:00:00.000Z");
    });

    it("returns null when expiresAt is absent", () => {
      expect(mapJobToDb(makeDto()).expiresAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Corpus signals (spec #4 liveness / #7 legitimacy)
  // -------------------------------------------------------------------------

  describe("corpus signals", () => {
    it("maps liveness state when present", () => {
      const result = mapJobToDb(
        makeDto({ liveness: { state: "expired", checkedAt: "2024-04-01T00:00:00Z" } })
      );
      expect(result.liveness).toBe("expired");
    });

    it("maps legitimacy state and reasons when present", () => {
      const result = mapJobToDb(
        makeDto({
          legitimacy: { state: "uncertain", reasons: ["No compensation disclosed."] },
        })
      );
      expect(result.legitimacy).toBe("uncertain");
      expect(result.legitimacyReasons).toEqual(["No compensation disclosed."]);
    });

    it("defaults all three signal fields to null when the source omits them", () => {
      const result = mapJobToDb(makeDto());
      expect(result.liveness).toBeNull();
      expect(result.legitimacy).toBeNull();
      expect(result.legitimacyReasons).toBeNull();
    });

    it("tolerates a legitimacy signal with no reasons", () => {
      const result = mapJobToDb(makeDto({ legitimacy: { state: "verified" } }));
      expect(result.legitimacy).toBe("verified");
      expect(result.legitimacyReasons).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Metadata fields
  // -------------------------------------------------------------------------

  describe("metadata fields", () => {
    it("includes rawData as the original DTO", () => {
      const dto = makeDto({ companyName: "Test Co" });
      const result = mapJobToDb(dto);

      expect(result.rawData).toBe(dto);
    });

    it("sets updatedAt to a Date close to now", () => {
      const before = Date.now();
      const result = mapJobToDb(makeDto());
      const after = Date.now();

      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.updatedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  // -------------------------------------------------------------------------
  // Full DTO mapping (integration-style)
  // -------------------------------------------------------------------------

  describe("full DTO mapping", () => {
    it("maps a complete DTO with all fields populated", () => {
      const fullDto: JobPostDto = {
        id: "job_abc",
        site: "indeed",
        title: "Senior Frontend Developer",
        companyName: "TechCorp",
        companyUrl: "https://techcorp.com",
        companyLogo: "https://techcorp.com/logo.png",
        jobUrl: "https://indeed.com/job/abc",
        jobUrlDirect: "https://techcorp.com/careers/abc",
        applyUrl: "https://techcorp.com/apply/abc",
        location: {
          city: "New York",
          state: "NY",
          country: "US",
        },
        isRemote: true,
        jobType: ["fulltime"],
        compensation: {
          minAmount: 150000,
          maxAmount: 200000,
          currency: "USD",
          interval: "yearly",
        },
        description: "Build amazing UIs",
        datePosted: "2024-06-01T12:00:00Z",
        skills: ["React", "TypeScript", "CSS"],
        department: "Engineering",
        team: "Frontend",
        employmentType: "full-time",
        jobLevel: "senior",
        jobFunction: "development",
        companyIndustry: "Technology",
        companyNumEmployees: "500-1000",
        companyDescription: "A great tech company",
      };

      const result = mapJobToDb(fullDto);

      expect(result.externalId).toBe("job_abc");
      expect(result.site).toBe("indeed");
      expect(result.title).toBe("Senior Frontend Developer");
      expect(result.companyName).toBe("TechCorp");
      expect(result.companyUrl).toBe("https://techcorp.com");
      expect(result.companyLogo).toBe("https://techcorp.com/logo.png");
      expect(result.jobUrl).toBe("https://indeed.com/job/abc");
      expect(result.jobUrlDirect).toBe("https://techcorp.com/careers/abc");
      expect(result.applyUrl).toBe("https://techcorp.com/apply/abc");
      expect(result.locationCity).toBe("New York");
      expect(result.locationState).toBe("NY");
      expect(result.locationCountry).toBe("US");
      expect(result.isRemote).toBe(true);
      expect(result.jobType).toEqual(["fulltime"]);
      expect(result.salaryMin).toBe("150000");
      expect(result.salaryMax).toBe("200000");
      expect(result.salaryCurrency).toBe("USD");
      expect(result.salaryInterval).toBe("yearly");
      expect(result.description).toBe("Build amazing UIs");
      expect(result.skills).toEqual(["React", "TypeScript", "CSS"]);
      expect(result.department).toBe("Engineering");
      expect(result.team).toBe("Frontend");
      expect(result.employmentType).toBe("full-time");
      expect(result.jobLevel).toBe("senior");
      expect(result.jobFunction).toBe("development");
      expect(result.companyIndustry).toBe("Technology");
      expect(result.companyNumEmployees).toBe("500-1000");
      expect(result.companyDescription).toBe("A great tech company");
      expect(result.datePosted).toEqual(new Date("2024-06-01T12:00:00Z"));
      expect(result.rawData).toBe(fullDto);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("maps a minimal DTO (only required fields)", () => {
      const result = mapJobToDb({
        id: "min_1",
        site: "glassdoor",
        title: "Intern",
      });

      expect(result.externalId).toBe("min_1");
      expect(result.site).toBe("glassdoor");
      expect(result.title).toBe("Intern");
      expect(result.companyName).toBeNull();
      expect(result.locationCity).toBeNull();
      expect(result.isRemote).toBe(false);
      expect(result.jobType).toEqual([]);
      expect(result.skills).toEqual([]);
      expect(result.salaryMin).toBeNull();
      expect(result.salaryMax).toBeNull();
      expect(result.datePosted).toBeNull();
    });
  });
});
