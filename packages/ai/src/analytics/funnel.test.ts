import { computeFunnel, type FunnelRow } from "./funnel";

const rows: FunnelRow[] = [
  { stage: "applied", score: 70 },
  { stage: "applied", score: 60 },
  { stage: "screening", score: 80 },
  { stage: "interviewing", score: 85 },
  { stage: "offer", score: 90 },
  { stage: "rejected", score: 55 },
  { stage: "saved", score: null },
];

describe("computeFunnel", () => {
  it("counts applications by stage", () => {
    const f = computeFunnel(rows);
    expect(f.total).toBe(7);
    expect(f.byStage.applied).toBe(2);
    expect(f.byStage.offer).toBe(1);
    expect(f.byStage.saved).toBe(1);
  });

  it("computes conversion ratios on furthest-reached rank", () => {
    const f = computeFunnel(rows);
    // appliedPlus = applied(2)+screening(1)+interviewing(1)+offer(1)+rejected(1) = 6
    // reached(2) = screening+interviewing+offer = 3 → 3/6 = 0.5
    expect(f.conversions.appliedToScreening).toBe(0.5);
    // reached(4)=1 offer; reached(3)=2 (interviewing+offer) → 1/2 = 0.5
    expect(f.conversions.interviewToOffer).toBe(0.5);
    // overall offer rate = 1/6 ≈ 0.17
    expect(f.conversions.overallOfferRate).toBe(0.17);
  });

  it("surfaces the score-vs-outcome signal", () => {
    const f = computeFunnel(rows);
    expect(f.avgScoreByOutcome.offer).toBe(90);
    expect(f.avgScoreByOutcome.rejected).toBe(55);
  });

  it("returns null conversions and means for an empty set", () => {
    const f = computeFunnel([]);
    expect(f.total).toBe(0);
    expect(f.conversions.overallOfferRate).toBeNull();
    expect(f.avgScore).toBeNull();
    expect(f.avgScoreByOutcome.offer).toBeNull();
  });
});
