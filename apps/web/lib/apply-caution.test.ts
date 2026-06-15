import { applyCaution } from "./apply-caution";

describe("applyCaution (spec #4/#7 pre-apply warning)", () => {
  it("warns and explains for an expired posting", () => {
    const r = applyCaution({ freshness: "expired", legitimacy: "likely" });
    expect(r.warn).toBe(true);
    expect(r.reasons[0]).toMatch(/expired/i);
  });

  it("warns for stale or uncertain freshness", () => {
    expect(applyCaution({ freshness: "stale", legitimacy: "likely" }).warn).toBe(true);
    expect(applyCaution({ freshness: "uncertain", legitimacy: "likely" }).warn).toBe(true);
  });

  it("warns for uncertain legitimacy even when fresh", () => {
    const r = applyCaution({ freshness: "fresh", legitimacy: "uncertain" });
    expect(r.warn).toBe(true);
    expect(r.reasons.some((x) => /legitimacy/i.test(x))).toBe(true);
  });

  it("stacks both reasons when freshness and legitimacy are both concerning", () => {
    const r = applyCaution({ freshness: "expired", legitimacy: "uncertain" });
    expect(r.reasons).toHaveLength(2);
  });

  it("does not warn for a fresh, legitimate posting", () => {
    expect(applyCaution({ freshness: "fresh", legitimacy: "verified" }).warn).toBe(false);
    expect(applyCaution({ freshness: "active", legitimacy: "likely" }).warn).toBe(false);
  });
});
