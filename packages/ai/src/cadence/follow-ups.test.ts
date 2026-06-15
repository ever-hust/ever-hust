import {
  computeFollowUpSuggestions,
  followUpUrgency,
  OVERDUE_AFTER_DAYS,
  type FollowUpApp,
} from "./follow-ups";

const now = new Date("2026-06-15T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function app(overrides: Partial<FollowUpApp> = {}): FollowUpApp {
  return {
    applicationId: 1,
    jobTitle: "Backend Engineer",
    companyName: "Acme",
    stage: "applied",
    stageChangedAt: daysAgo(7),
    followUpCount: 0,
    lastFollowUpAt: null,
    ...overrides,
  };
}

describe("computeFollowUpSuggestions", () => {
  it("suggests a follow-up for a stale applied role", () => {
    const r = computeFollowUpSuggestions([app({ stageChangedAt: daysAgo(7) })], now);
    expect(r).toHaveLength(1);
    expect(r[0]!.daysSinceActivity).toBe(7);
  });

  it("does not suggest too soon after applying", () => {
    const r = computeFollowUpSuggestions([app({ stageChangedAt: daysAgo(1) })], now);
    expect(r).toHaveLength(0);
  });

  it("stops suggesting once the cap is reached", () => {
    const r = computeFollowUpSuggestions(
      [app({ followUpCount: 3, lastFollowUpAt: daysAgo(30) })],
      now,
    );
    expect(r).toHaveLength(0);
  });

  it("skips non-followable stages (saved / offer / terminal)", () => {
    const r = computeFollowUpSuggestions(
      [
        app({ applicationId: 1, stage: "saved", stageChangedAt: daysAgo(30) }),
        app({ applicationId: 2, stage: "offer", stageChangedAt: daysAgo(30) }),
        app({ applicationId: 3, stage: "rejected", stageChangedAt: daysAgo(30) }),
      ],
      now,
    );
    expect(r).toHaveLength(0);
  });

  it("uses last follow-up as the anchor and sorts by staleness", () => {
    const r = computeFollowUpSuggestions(
      [
        app({ applicationId: 1, stage: "applied", stageChangedAt: daysAgo(20) }),
        app({ applicationId: 2, stage: "screening", stageChangedAt: daysAgo(40), lastFollowUpAt: daysAgo(10) }),
      ],
      now,
    );
    expect(r.map((s) => s.applicationId)).toEqual([1, 2]); // 20d > 10d
  });
});

describe("followUpUrgency", () => {
  it("flags a long-idle applied role as overdue", () => {
    const r = followUpUrgency(app({ stage: "applied", stageChangedAt: daysAgo(OVERDUE_AFTER_DAYS) }), now);
    expect(r.urgency).toBe("overdue");
    expect(r.daysSinceActivity).toBe(OVERDUE_AFTER_DAYS);
  });

  it("marks an eligible-but-recent role as due", () => {
    const r = followUpUrgency(app({ stage: "applied", stageChangedAt: daysAgo(4) }), now);
    expect(r.urgency).toBe("due");
  });

  it("marks a just-touched role as waiting (interval not elapsed)", () => {
    const r = followUpUrgency(app({ stage: "applied", stageChangedAt: daysAgo(1) }), now);
    expect(r.urgency).toBe("waiting");
  });

  it("marks a capped role as capped", () => {
    const r = followUpUrgency(
      app({ stage: "interviewing", followUpCount: 3, lastFollowUpAt: daysAgo(30) }),
      now,
    );
    expect(r.urgency).toBe("capped");
  });

  it("returns none for non-followable stages", () => {
    expect(followUpUrgency(app({ stage: "saved", stageChangedAt: daysAgo(30) }), now).urgency).toBe("none");
    expect(followUpUrgency(app({ stage: "offer", stageChangedAt: daysAgo(30) }), now).urgency).toBe("none");
    expect(followUpUrgency(app({ stage: "rejected", stageChangedAt: daysAgo(30) }), now).urgency).toBe("none");
  });

  it("anchors on the last follow-up when present", () => {
    // Entered the stage 40d ago but followed up 1d ago → waiting, not overdue.
    const r = followUpUrgency(
      app({ stage: "screening", stageChangedAt: daysAgo(40), followUpCount: 1, lastFollowUpAt: daysAgo(1) }),
      now,
    );
    expect(r.urgency).toBe("waiting");
    expect(r.daysSinceActivity).toBe(1);
  });
});
