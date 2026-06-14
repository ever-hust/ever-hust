import { computeFreshness, isCaution } from "./freshness";

const now = new Date("2026-06-15T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

describe("computeFreshness", () => {
  it("labels a recent posting as fresh", () => {
    const r = computeFreshness({ datePosted: daysAgo(3), now });
    expect(r.state).toBe("fresh");
    expect(r.ageDays).toBe(3);
  });

  it("labels a mid-age posting as active", () => {
    expect(computeFreshness({ datePosted: daysAgo(30), now }).state).toBe("active");
  });

  it("labels an old posting as stale", () => {
    expect(computeFreshness({ datePosted: daysAgo(90), now }).state).toBe("stale");
  });

  it("labels an expired posting (by expiresAt) as expired", () => {
    const r = computeFreshness({ datePosted: daysAgo(5), expiresAt: daysAgo(1), now });
    expect(r.state).toBe("expired");
  });

  it("treats a missing posted date as uncertain (never hidden)", () => {
    const r = computeFreshness({ datePosted: null, now });
    expect(r.state).toBe("uncertain");
    expect(r.label).toBe("Date unknown");
  });

  it("honours an explicit Ever Jobs liveness signal over the date heuristic", () => {
    // Fresh by date, but the corpus says it's expired.
    expect(
      computeFreshness({ datePosted: daysAgo(2), liveness: "expired", now }).state,
    ).toBe("expired");
    expect(
      computeFreshness({ datePosted: daysAgo(2), liveness: "uncertain", now }).state,
    ).toBe("uncertain");
  });

  it("isCaution flags stale/expired/uncertain only", () => {
    expect(isCaution("fresh")).toBe(false);
    expect(isCaution("active")).toBe(false);
    expect(isCaution("stale")).toBe(true);
    expect(isCaution("expired")).toBe(true);
    expect(isCaution("uncertain")).toBe(true);
  });
});
