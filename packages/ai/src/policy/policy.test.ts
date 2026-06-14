import { assertNoInvented } from "./assert-no-invented";
import { evaluateCostGate } from "./cost-gate";
import { canSendFollowUp, DEFAULT_FOLLOW_UP_POLICY } from "./follow-up-policy";
import { isOutwardAction, OUTWARD_ACTION_TOOLS } from "./require-approval";

describe("assertNoInvented", () => {
  it("passes when every claim is grounded in allowedFacts", () => {
    const r = assertNoInvented({
      text: "Worked at Acme Corp since 2019, shipping the Payments Platform.",
      allowedFacts: ["Acme Corp", "2019", "Payments Platform"],
    });
    expect(r.grounded).toBe(true);
    expect(r.flaggedClaims).toEqual([]);
  });

  it("flags a fabricated employer", () => {
    const r = assertNoInvented({
      text: "Led teams at Globex Industries.",
      allowedFacts: ["Acme Corp"],
    });
    expect(r.grounded).toBe(false);
    expect(r.flaggedClaims).toContain("Globex Industries");
  });

  it("flags an unverifiable number", () => {
    const r = assertNoInvented({
      text: "Increased revenue by 250%.",
      allowedFacts: [],
    });
    expect(r.grounded).toBe(false);
    expect(r.flaggedClaims).toContain("250%");
  });

  it("does not flag a lone sentence-initial 'I'", () => {
    const r = assertNoInvented({
      text: "I designed and built backend services.",
      allowedFacts: [],
    });
    expect(r.grounded).toBe(true);
  });
});

describe("evaluateCostGate", () => {
  it("allows when no constraints", () => {
    expect(evaluateCostGate({}).allowed).toBe(true);
  });
  it("blocks below the score floor", () => {
    expect(evaluateCostGate({ score: 50, scoreFloor: 60 })).toEqual({
      allowed: false,
      reason: "below_score_floor",
    });
  });
  it("blocks when score is unknown but a floor is set", () => {
    expect(evaluateCostGate({ score: null, scoreFloor: 60 }).allowed).toBe(false);
  });
  it("allows at/above the floor", () => {
    expect(evaluateCostGate({ score: 80, scoreFloor: 60 }).allowed).toBe(true);
  });
  it("blocks over quota", () => {
    expect(evaluateCostGate({ underQuota: false })).toEqual({
      allowed: false,
      reason: "over_quota",
    });
  });
});

describe("canSendFollowUp", () => {
  const base = new Date("2026-06-15T00:00:00Z");
  it("allows the first follow-up", () => {
    expect(
      canSendFollowUp({ sentCount: 0, lastSentAt: null, now: base }).allowed,
    ).toBe(true);
  });
  it("blocks at the max cap", () => {
    expect(
      canSendFollowUp({
        sentCount: DEFAULT_FOLLOW_UP_POLICY.maxFollowUps,
        lastSentAt: null,
        now: base,
      }),
    ).toEqual({ allowed: false, reason: "max_reached" });
  });
  it("blocks when sent too recently", () => {
    const lastSentAt = new Date(base.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    expect(canSendFollowUp({ sentCount: 1, lastSentAt, now: base })).toEqual({
      allowed: false,
      reason: "too_soon",
    });
  });
  it("allows after the min interval", () => {
    const lastSentAt = new Date(base.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    expect(
      canSendFollowUp({ sentCount: 1, lastSentAt, now: base }).allowed,
    ).toBe(true);
  });
});

describe("OUTWARD_ACTION_TOOLS registry (invariant)", () => {
  it("includes the known outward-action tools", () => {
    expect(OUTWARD_ACTION_TOOLS).toContain("applyJob");
    expect(OUTWARD_ACTION_TOOLS).toContain("submitAnswers");
  });
  it("isOutwardAction is true for registered tools and false otherwise", () => {
    expect(isOutwardAction("applyJob")).toBe(true);
    expect(isOutwardAction("searchJobs")).toBe(false);
    expect(isOutwardAction("evaluateJob")).toBe(false); // read-only — not outward
  });
});
