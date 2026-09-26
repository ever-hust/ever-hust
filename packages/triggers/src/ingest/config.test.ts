import { describe, it, expect, jest, afterEach } from "@jest/globals";
import {
  buildSyncPlan,
  DEFAULT_KEYWORD_SITE_CATEGORIES,
  geocodeMaxCallsFor,
  LEGACY_RESULTS_PER_SOURCE,
  parseFullSyncSetting,
  MAX_RESULTS_PER_SOURCE,
  parsePositiveInt,
  parseSiteCategories,
  readSyncEnv,
  rotationTerm,
  ROTATION_SLOT_MS,
  type SyncEnvConfig,
} from "./config";
import { SEARCH_TERMS } from "../map-job";

const ENV: SyncEnvConfig = {
  fullResultsPerSource: 1000,
  keywordResultsPerSource: 100,
  keywordSiteCategories: ["job-board", "remote"],
  geocodeMaxCalls: 500,
  keywordGeocodeMaxCalls: 100,
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("readSyncEnv", () => {
  it("uses the spec defaults when nothing is set", () => {
    expect(readSyncEnv({})).toEqual({
      fullSync: "auto",
      fullResultsPerSource: 1000,
      keywordResultsPerSource: 100,
      keywordSiteCategories: [
        "job-board",
        "niche",
        "regional",
        "remote",
        "government",
        "freelance",
      ],
      geocodeMaxCalls: 500,
      keywordGeocodeMaxCalls: 100,
    });
  });

  it("reads and clamps overrides", () => {
    const env = readSyncEnv({
      JOBS_SYNC_FULL_RESULTS_PER_SOURCE: "250",
      JOBS_SYNC_KEYWORD_RESULTS_PER_SOURCE: "999999",
      JOBS_SYNC_KEYWORD_SITE_CATEGORIES: " Remote , job-board,remote ",
      JOBS_SYNC_GEOCODE_MAX_CALLS: "0",
    });
    expect(env.fullResultsPerSource).toBe(250);
    expect(env.keywordResultsPerSource).toBe(MAX_RESULTS_PER_SOURCE);
    expect(env.keywordSiteCategories).toEqual(["remote", "job-board"]);
    expect(env.geocodeMaxCalls).toBe(0);
  });

  it("falls back on invalid numbers and drops unknown categories with a warning", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const env = readSyncEnv({
      JOBS_SYNC_FULL_RESULTS_PER_SOURCE: "-5",
      JOBS_SYNC_KEYWORD_RESULTS_PER_SOURCE: "abc",
      JOBS_SYNC_KEYWORD_SITE_CATEGORIES: "made-up,niche",
      JOBS_SYNC_GEOCODE_MAX_CALLS: "1.5",
    });
    expect(env.fullResultsPerSource).toBe(1000);
    expect(env.keywordResultsPerSource).toBe(100);
    expect(env.keywordSiteCategories).toEqual(["niche"]);
    expect(env.geocodeMaxCalls).toBe(500);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("made-up"));
  });
});

describe("per-mode Google geocoding caps", () => {
  it("keyword runs default to a lower cap, never above the general one", () => {
    expect(readSyncEnv({}).keywordGeocodeMaxCalls).toBe(100);
    expect(readSyncEnv({ JOBS_SYNC_KEYWORD_GEOCODE_MAX_CALLS: "40" }).keywordGeocodeMaxCalls).toBe(40);
    expect(readSyncEnv({ JOBS_SYNC_GEOCODE_MAX_CALLS: "0" }).keywordGeocodeMaxCalls).toBe(0);
    expect(
      readSyncEnv({ JOBS_SYNC_GEOCODE_MAX_CALLS: "50", JOBS_SYNC_KEYWORD_GEOCODE_MAX_CALLS: "80" }).keywordGeocodeMaxCalls,
    ).toBe(50);
  });

  it("geocodeMaxCallsFor picks the cap of the mode", () => {
    expect(geocodeMaxCallsFor("full", ENV)).toBe(500);
    expect(geocodeMaxCallsFor("keywords", ENV)).toBe(100);
  });
});

describe("parsers", () => {
  it("parsePositiveInt", () => {
    expect(parsePositiveInt(undefined, 7, 10)).toBe(7);
    expect(parsePositiveInt("  ", 7, 10)).toBe(7);
    expect(parsePositiveInt("0", 7, 10)).toBe(7);
    expect(parsePositiveInt("3", 7, 10)).toBe(3);
    expect(parsePositiveInt("30", 7, 10)).toBe(10);
  });

  it("parseSiteCategories keeps the default when no entry is valid", () => {
    expect(parseSiteCategories("nope", DEFAULT_KEYWORD_SITE_CATEGORIES)).toEqual({
      categories: [...DEFAULT_KEYWORD_SITE_CATEGORIES],
      rejected: ["nope"],
    });
  });
});

describe("buildSyncPlan", () => {
  it("full mode: one list-mode request — no searchTerm, no siteCategories, per-source cap, USA hint", () => {
    const plan = buildSyncPlan({ mode: "full" }, ENV, 0, "v1");
    expect(plan.mode).toBe("full");
    expect(plan.terms).toEqual([]);
    expect(plan.inputs).toHaveLength(1);
    const input = plan.inputs[0]!;
    expect(input).not.toHaveProperty("searchTerm");
    expect(input).not.toHaveProperty("siteCategories");
    expect(input).not.toHaveProperty("location");
    expect(input.resultsWanted).toBe(1000);
    expect(input.country).toBe("USA");
    expect(input.descriptionFormat).toBe("markdown");
  });

  it("keywords mode (default): the rotation term, keyword categories, keyword cap", () => {
    const now = 3 * ROTATION_SLOT_MS + 1;
    const plan = buildSyncPlan({}, ENV, now, "v1");
    expect(plan.mode).toBe("keywords");
    expect(plan.terms).toEqual([SEARCH_TERMS[3]]);
    expect(plan.inputs).toEqual([
      expect.objectContaining({
        searchTerm: SEARCH_TERMS[3],
        siteCategories: ["job-board", "remote"],
        resultsWanted: 100,
        country: "USA",
      }),
    ]);
  });

  it("keywords mode honours explicit terms (trimmed, de-duplicated, blanks dropped, max 5)", () => {
    const plan = buildSyncPlan(
      { mode: "keywords", searchTerms: [" a ", "", "b", "a", "c", "d", "e", "f"] },
      ENV,
      0,
    );
    expect(plan.terms).toEqual(["a", "b", "c", "d", "e"]);
    expect(plan.inputs.map((i) => i.searchTerm)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("request overrides for resultsWanted (clamped) and siteCategories", () => {
    const plan = buildSyncPlan(
      { mode: "keywords", resultsWanted: 1e9, siteCategories: ["government"] },
      ENV,
      0,
    );
    expect(plan.inputs[0]!.resultsWanted).toBe(MAX_RESULTS_PER_SOURCE);
    expect(plan.inputs[0]!.siteCategories).toEqual(["government"]);
    const full = buildSyncPlan({ mode: "full", resultsWanted: 80 }, ENV, 0, "v1");
    expect(full.inputs[0]!.resultsWanted).toBe(80);
  });
});

describe("full mode gate and keyword count vs. the Ever Jobs contract (spec D18)", () => {
  it("parses JOBS_SYNC_FULL_ENABLED", () => {
    expect(parseFullSyncSetting(undefined)).toBe("auto");
    expect(parseFullSyncSetting(" AUTO ")).toBe("auto");
    expect(parseFullSyncSetting("true")).toBe("on");
    expect(parseFullSyncSetting("1")).toBe("on");
    expect(parseFullSyncSetting("false")).toBe("off");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseFullSyncSetting("sometimes")).toBe("auto");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("sometimes"));
  });

  it("auto: full mode runs only once the server was seen speaking contract v1", () => {
    const unknown = buildSyncPlan({ mode: "full" }, ENV, 0);
    expect(unknown).toMatchObject({ mode: "full", inputs: [], skipped: expect.stringContaining("not answered in NDJSON") });
    const legacy = buildSyncPlan({ mode: "full" }, ENV, 0, "legacy");
    expect(legacy).toMatchObject({ inputs: [], skipped: expect.stringContaining("predates contract v1") });
    const v1 = buildSyncPlan({ mode: "full" }, ENV, 0, "v1");
    expect(v1.skipped).toBeUndefined();
    expect(v1.inputs).toHaveLength(1);
  });

  it("JOBS_SYNC_FULL_ENABLED=true forces full mode, =false disables it", () => {
    expect(buildSyncPlan({ mode: "full" }, { ...ENV, fullSync: "on" }, 0, "legacy").inputs).toHaveLength(1);
    expect(buildSyncPlan({ mode: "full" }, { ...ENV, fullSync: "off" }, 0, "v1")).toMatchObject({
      inputs: [],
      skipped: expect.stringContaining("disabled"),
    });
  });

  it("keyword runs use the legacy per-source count until contract v1 is seen; an explicit count wins", () => {
    expect(buildSyncPlan({}, ENV, 0, "unknown").inputs[0]!.resultsWanted).toBe(LEGACY_RESULTS_PER_SOURCE);
    expect(buildSyncPlan({}, ENV, 0, "legacy").inputs[0]!.resultsWanted).toBe(80);
    expect(buildSyncPlan({}, ENV, 0, "v1").inputs[0]!.resultsWanted).toBe(100);
    expect(buildSyncPlan({}, { ...ENV, keywordResultsPerSource: 50 }, 0, "legacy").inputs[0]!.resultsWanted).toBe(50);
    expect(buildSyncPlan({ resultsWanted: 300 }, ENV, 0, "legacy").inputs[0]!.resultsWanted).toBe(300);
  });

  it("caps any per-source count at 1000 (spec 01a §7.2)", () => {
    expect(MAX_RESULTS_PER_SOURCE).toBe(1000);
  });
});

describe("rotationTerm", () => {
  it("advances one term per 15-minute slot and wraps", () => {
    expect(rotationTerm(0)).toBe(SEARCH_TERMS[0]);
    expect(rotationTerm(ROTATION_SLOT_MS)).toBe(SEARCH_TERMS[1]);
    expect(rotationTerm(ROTATION_SLOT_MS * SEARCH_TERMS.length)).toBe(SEARCH_TERMS[0]);
  });

  it("reaches every term, including the intern / new-grad / quant additions", () => {
    const seen = new Set<string>();
    for (let slot = 0; slot < SEARCH_TERMS.length; slot++) {
      seen.add(rotationTerm(slot * ROTATION_SLOT_MS));
    }
    expect(seen.size).toBe(SEARCH_TERMS.length);
    for (const term of [
      "software engineer intern",
      "new grad software engineer",
      "entry level software engineer",
      "machine learning intern",
      "data science intern",
      "AI engineer new grad",
      "quantitative researcher",
      "quantitative trader intern",
    ]) {
      expect(seen.has(term)).toBe(true);
    }
  });
});
