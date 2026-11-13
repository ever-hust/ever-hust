import { cvExperienceEvidenceText, splitKeywordsByCvEvidence } from "./keyword-evidence";

describe("cvExperienceEvidenceText", () => {
  it("includes description text and roles beyond the eighth", () => {
    const experience = Array.from({ length: 10 }, (_, i) => ({
      title: `Role ${i}`,
      company: `Co ${i}`,
      description: i === 9 ? "Operated Kubernetes clusters." : "General duties.",
    }));
    const text = cvExperienceEvidenceText(experience);
    expect(splitKeywordsByCvEvidence(["Kubernetes"], [], text).inCv).toEqual(["Kubernetes"]);
  });

  it("includes legacy summary fields and tolerates malformed input", () => {
    expect(cvExperienceEvidenceText([{ summary: "Used Terraform." }, null, "x", 5])).toContain(
      "Terraform",
    );
    expect(cvExperienceEvidenceText(undefined)).toBe("");
    expect(cvExperienceEvidenceText({})).toBe("");
  });
});

describe("splitKeywordsByCvEvidence", () => {
  it("matches the explicit skill list case-insensitively", () => {
    const r = splitKeywordsByCvEvidence(["TypeScript", "Kubernetes"], ["typescript"], "");
    expect(r).toEqual({ inCv: ["TypeScript"], notInCv: ["Kubernetes"] });
  });

  it("matches terms found in experience text on word boundaries", () => {
    const r = splitKeywordsByCvEvidence(
      ["PostgreSQL", "Terraform"],
      [],
      "Backend engineer at Acme — migrated services to PostgreSQL.",
    );
    expect(r.inCv).toEqual(["PostgreSQL"]);
    expect(r.notInCv).toEqual(["Terraform"]);
  });

  it("does not treat Java as evidenced by JavaScript", () => {
    const r = splitKeywordsByCvEvidence(["Java"], [], "Built UIs in JavaScript and TypeScript.");
    expect(r.notInCv).toEqual(["Java"]);
  });

  it("does not treat C as evidenced by C++ or C#", () => {
    const r = splitKeywordsByCvEvidence(["C", "C#"], [], "Wrote C++ services.");
    expect(r.notInCv).toEqual(["C", "C#"]);
  });

  it("keeps symbol terms working in free text", () => {
    const r = splitKeywordsByCvEvidence(["C++", "C#"], [], "Wrote C++ and C# services.");
    expect(r.inCv).toEqual(["C++", "C#"]);
  });

  it("ignores short plain-word terms in free text (Go vs 'go to market')", () => {
    const r = splitKeywordsByCvEvidence(["Go"], [], "Led the go to market plan.");
    expect(r.notInCv).toEqual(["Go"]);
  });

  it("still counts short terms when they are in the skill list", () => {
    const r = splitKeywordsByCvEvidence(["Go"], ["Go"], "");
    expect(r.inCv).toEqual(["Go"]);
  });

  it("treats React.js and React as the same term", () => {
    expect(splitKeywordsByCvEvidence(["React.js"], ["React"], "").inCv).toEqual(["React.js"]);
    expect(splitKeywordsByCvEvidence(["React"], [], "Built apps in React.js.").inCv).toEqual([
      "React",
    ]);
  });

  it("does not treat Next.js as evidenced by the plain word 'next'", () => {
    const r = splitKeywordsByCvEvidence(
      ["Next.js"],
      [],
      "Building the next generation of products.",
    );
    expect(r.notInCv).toEqual(["Next.js"]);
  });

  it("still matches Next.js written out in the CV text or skill list", () => {
    expect(splitKeywordsByCvEvidence(["Next.js"], [], "Shipped apps with Next.js.").inCv).toEqual([
      "Next.js",
    ]);
    expect(splitKeywordsByCvEvidence(["Next.js"], ["Next.js"], "").inCv).toEqual(["Next.js"]);
  });

  it("skips keywords longer than the schema limit instead of returning them", () => {
    const long = "x".repeat(101);
    const r = splitKeywordsByCvEvidence([long, "Rust"], [], "");
    expect(r.notInCv).toEqual(["Rust"]);
    expect(r.inCv).toEqual([]);
  });

  it("de-duplicates keywords and drops empties", () => {
    const r = splitKeywordsByCvEvidence(["SQL", "sql", " ", "Rust"], ["SQL"], "");
    expect(r).toEqual({ inCv: ["SQL"], notInCv: ["Rust"] });
  });

  it("handles empty input", () => {
    expect(splitKeywordsByCvEvidence([], [], "")).toEqual({ inCv: [], notInCv: [] });
  });

  it("does not throw on regex metacharacters", () => {
    expect(() => splitKeywordsByCvEvidence(["(foo[", "a+b*"], [], "text")).not.toThrow();
  });

  it("caps the number of keywords examined", () => {
    const many = Array.from({ length: 200 }, (_, i) => `skill${i}`);
    const r = splitKeywordsByCvEvidence(many, [], "");
    expect(r.notInCv).toHaveLength(60);
  });
});
