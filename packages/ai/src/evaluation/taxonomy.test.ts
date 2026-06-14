import { JOB_FAMILIES, detectTaxonomy } from "./taxonomy";

describe("JOB_FAMILIES data", () => {
  it("defines the 7 families each with archetypes", () => {
    expect(JOB_FAMILIES).toHaveLength(7);
    for (const fam of JOB_FAMILIES) {
      expect(fam.family.length).toBeGreaterThan(0);
      expect(fam.keywords.length).toBeGreaterThan(0);
      expect(fam.archetypes.length).toBeGreaterThan(0);
    }
  });
});

describe("detectTaxonomy", () => {
  it("detects a backend software engineering role from the title", () => {
    const r = detectTaxonomy({
      title: "Senior Backend Software Engineer",
      description: "Build distributed services and APIs.",
    });
    expect(r.jobFamily).toBe("Software Eng");
    expect(r.archetype).toBe("Backend");
  });

  it("detects an SRE archetype", () => {
    const r = detectTaxonomy({
      title: "Site Reliability Engineer",
      description: "Own on-call, observability, and uptime for our platform.",
    });
    expect(r.jobFamily).toBe("Software Eng");
    expect(r.archetype).toBe("SRE");
  });

  it("detects a product manager role", () => {
    const r = detectTaxonomy({
      title: "Product Manager",
      description: "Own the roadmap and PRD; partner with engineering on discovery.",
    });
    expect(r.jobFamily).toBe("Product");
  });

  it("detects a marketing role", () => {
    const r = detectTaxonomy({
      title: "Growth Marketing Lead",
      description: "Own paid acquisition, CAC, and lifecycle campaigns.",
    });
    expect(r.jobFamily).toBe("Marketing");
  });

  it("detects a sales AE role", () => {
    const r = detectTaxonomy({
      title: "Account Executive",
      description: "Close new business, manage pipeline, hit quota and grow ARR.",
    });
    expect(r.jobFamily).toBe("Sales");
    expect(r.archetype).toBe("AE");
  });

  it("falls back to a generic family/archetype when nothing matches", () => {
    const r = detectTaxonomy({ title: "Zookeeper", description: "Care for animals." });
    expect(r.jobFamily).toBe("Ops / Other");
    expect(r.archetype).toBe("General");
  });

  it("never throws on empty input", () => {
    expect(() => detectTaxonomy({})).not.toThrow();
    expect(detectTaxonomy({ title: null, description: null }).jobFamily.length).toBeGreaterThan(0);
  });
});
