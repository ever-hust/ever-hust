import {
  DEFAULT_DIMENSIONS,
  DETERMINISTIC_KEYS,
  LLM_KEYS,
  resolveWeights,
  scoreComp,
  scoreRemote,
  scoreLevel,
  levelOrdinal,
  cvSkillOverlap,
  bandFromScore5,
  computeScore,
} from "./scoring";

describe("DEFAULT_DIMENSIONS", () => {
  it("has 10 dimensions whose weights sum to 100", () => {
    expect(DEFAULT_DIMENSIONS).toHaveLength(10);
    const sum = DEFAULT_DIMENSIONS.reduce((a, d) => a + d.weight, 0);
    expect(sum).toBe(100);
  });

  it("splits 3 deterministic + 7 llm dimensions", () => {
    expect(DETERMINISTIC_KEYS.sort()).toEqual(["comp", "level", "remote"]);
    expect(LLM_KEYS).toHaveLength(7);
    expect(LLM_KEYS).toContain("north_star");
    expect(LLM_KEYS).toContain("cv_match");
  });
});

describe("resolveWeights", () => {
  it("returns the default matrix (summing 100) when no layers given", () => {
    const { weights, usedDefault } = resolveWeights({});
    expect(usedDefault).toBe(false);
    expect(Math.round(Object.values(weights).reduce((a, b) => a + b, 0))).toBe(100);
    expect(weights.north_star).toBeCloseTo(25);
  });

  it("applies a partial override and renormalizes to 100", () => {
    const { weights, usedDefault } = resolveWeights({ override: { comp: 30 } });
    expect(usedDefault).toBe(false);
    expect(Math.round(Object.values(weights).reduce((a, b) => a + b, 0))).toBe(100);
    // comp got a bigger share than the default 10
    expect(weights.comp).toBeGreaterThan(10);
  });

  it("respects precedence override > user > org", () => {
    const { weights } = resolveWeights({
      org: { comp: 12 },
      user: { comp: 20 },
      override: { comp: 40 },
    });
    // override wins; after renormalize comp is the largest single bump
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(Math.round(total)).toBe(100);
    expect(weights.comp).toBeGreaterThan(weights.growth);
  });

  it("ignores unknown dimension keys", () => {
    const { weights, usedDefault } = resolveWeights({ override: { not_a_dim: 50 } });
    expect(usedDefault).toBe(false);
    expect("not_a_dim" in weights).toBe(false);
  });

  it("falls back to default on an out-of-range value", () => {
    const { usedDefault, weights } = resolveWeights({ override: { comp: 200 } });
    expect(usedDefault).toBe(true);
    expect(weights.comp).toBe(10);
  });

  it("falls back to default on a non-finite value", () => {
    const { usedDefault } = resolveWeights({ user: { comp: NaN } });
    expect(usedDefault).toBe(true);
  });
});

describe("scoreComp", () => {
  it("scores 5 and good_fit when the posting comfortably beats target", () => {
    const r = scoreComp({ salaryMin: 180000, salaryMax: 220000 }, { min: 150000, max: null });
    expect(r.score5).toBe(5); // midpoint 200k / 150k = 1.33
    expect(r.budgetFit).toBe("good_fit");
  });

  it("flags over_budget when pay is far above target (possible level stretch)", () => {
    const r = scoreComp({ salaryMin: 290000, salaryMax: 310000 }, { min: 150000, max: null });
    expect(r.score5).toBe(5); // midpoint 300k / 150k = 2.0
    expect(r.budgetFit).toBe("over_budget");
  });

  it("flags under_budget when pay is below target", () => {
    const r = scoreComp({ salaryMin: 90000, salaryMax: 100000 }, { min: 150000, max: null });
    expect(r.score5).toBeLessThanOrEqual(2);
    expect(r.budgetFit).toBe("under_budget");
  });

  it("returns unknown/neutral when posting has no salary", () => {
    const r = scoreComp({ salaryMin: null, salaryMax: null }, { min: 150000, max: null });
    expect(r.score5).toBe(3);
    expect(r.budgetFit).toBe("unknown");
  });

  it("returns unknown/neutral when the user has no target", () => {
    const r = scoreComp({ salaryMin: 120000, salaryMax: 140000 }, { min: null, max: null });
    expect(r.score5).toBe(3);
    expect(r.budgetFit).toBe("unknown");
  });
});

describe("scoreRemote", () => {
  it("rewards a remote role for a remote-preferring user", () => {
    expect(scoreRemote(true, "remote").score5).toBe(5);
  });
  it("penalizes an on-site role for a remote-preferring user", () => {
    expect(scoreRemote(false, "remote").score5).toBe(2);
  });
  it("is neutral-positive when the user has no preference", () => {
    expect(scoreRemote(true, "any").score5).toBe(4);
    expect(scoreRemote(false, null).score5).toBe(4);
  });
  it("is neutral when work mode is unknown", () => {
    expect(scoreRemote(null, "remote").score5).toBe(3);
  });
  it("rewards on-site for an on-site preference", () => {
    expect(scoreRemote(false, "onsite").score5).toBe(5);
  });
});

describe("levelOrdinal / scoreLevel", () => {
  it("maps common seniority labels", () => {
    expect(levelOrdinal("Senior")).toBe(3);
    expect(levelOrdinal("Staff Engineer")).toBe(4);
    expect(levelOrdinal("Director of Eng")).toBe(5);
    expect(levelOrdinal("Junior")).toBe(1);
    expect(levelOrdinal(null)).toBeNull();
    expect(levelOrdinal("totally unknown")).toBeNull();
  });

  it("scores 5 for a perfect level match", () => {
    expect(scoreLevel("Senior", "senior").score5).toBe(5);
  });
  it("scores lower as the gap widens", () => {
    expect(scoreLevel("Director", "junior").score5).toBeLessThanOrEqual(2);
  });
  it("is neutral when either level is unknown", () => {
    expect(scoreLevel(null, "senior").score5).toBe(3);
  });
});

describe("cvSkillOverlap", () => {
  it("computes matched/missing and a ratio (case-insensitive)", () => {
    const r = cvSkillOverlap(["TypeScript", "React", "Node"], ["typescript", "GraphQL", "react"]);
    expect(r.matched.sort()).toEqual(["react", "typescript"]);
    expect(r.missing).toEqual(["GraphQL"]);
    expect(r.ratio).toBeCloseTo(2 / 3);
  });
  it("returns ratio 0 when the posting lists no skills", () => {
    expect(cvSkillOverlap(["a", "b"], []).ratio).toBe(0);
  });
  it("dedupes repeated posting skills", () => {
    const r = cvSkillOverlap(["go"], ["Go", "go", "Rust"]);
    expect(r.matched).toEqual(["Go"]);
    expect(r.missing).toEqual(["Rust"]);
  });
});

describe("bandFromScore5", () => {
  it("maps score5 to the published bands", () => {
    expect(bandFromScore5(4.7)).toBe("apply_now");
    expect(bandFromScore5(4.5)).toBe("apply_now");
    expect(bandFromScore5(4.2)).toBe("worth_it");
    expect(bandFromScore5(3.6)).toBe("specific_reason");
    expect(bandFromScore5(3.4)).toBe("not_recommended");
    expect(bandFromScore5(1)).toBe("not_recommended");
  });
});

describe("computeScore", () => {
  it("weights dimensions and mirrors 1–5 to 0–100", () => {
    const dims = [
      { weight: 50, score5: 5 },
      { weight: 50, score5: 3 },
    ];
    const r = computeScore(dims);
    expect(r.score5).toBe(4); // (5+3)/2
    expect(r.score100).toBe(80); // 4/5*100
    expect(r.band).toBe("worth_it");
  });

  it("produces not_recommended for a poor fit", () => {
    const r = computeScore([{ weight: 100, score5: 2 }]);
    expect(r.band).toBe("not_recommended");
    expect(r.score100).toBe(40);
  });

  it("handles arbitrary weight totals via normalization", () => {
    const r = computeScore([
      { weight: 25, score5: 5 },
      { weight: 15, score5: 5 },
    ]);
    expect(r.score5).toBe(5);
    expect(r.score100).toBe(100);
  });
});
