import { extractStyleFingerprint } from "./fingerprint";

describe("extractStyleFingerprint", () => {
  it("computes aggregate metrics", () => {
    const fp = extractStyleFingerprint([
      "I built scalable backend services. I led a small team.",
    ]);
    expect(fp.sampleCount).toBe(1);
    expect(fp.avgSentenceLength).toBeGreaterThan(0);
    expect(fp.firstPersonRatio).toBeGreaterThan(0);
  });

  it("detects casual vs formal tone", () => {
    expect(
      extractStyleFingerprint(["gonna ship really awesome stuff, kinda fast"]).formality,
    ).toBe("casual");
    expect(
      extractStyleFingerprint([
        "The candidate demonstrated exceptional architectural leadership throughout the engagement, consistently delivering measurable organizational outcomes",
      ]).formality,
    ).toBe("formal");
  });

  it("PRIVACY: never leaks distinctive content words from the input", () => {
    const fp = extractStyleFingerprint([
      "I deployed Kubernetes clusters at Globex using proprietary Frobnicator pipelines.",
    ]);
    const serialized = JSON.stringify(fp).toLowerCase();
    for (const secret of ["kubernetes", "globex", "frobnicator", "proprietary"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("handles empty input safely", () => {
    const fp = extractStyleFingerprint([]);
    expect(fp.sampleCount).toBe(0);
    expect(fp.avgSentenceLength).toBe(0);
  });
});
