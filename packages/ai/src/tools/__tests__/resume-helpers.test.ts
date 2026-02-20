import {
  extractAtsKeywords,
  findSkillOverlap,
  getFormatTips,
} from "../resume-helpers";

// ---------------------------------------------------------------------------
// extractAtsKeywords()
// ---------------------------------------------------------------------------
describe("extractAtsKeywords", () => {
  describe("multi-word pattern matching", () => {
    it("should extract 'machine learning' from description", () => {
      const keywords = extractAtsKeywords(
        "We need someone experienced in machine learning and data pipelines."
      );
      expect(keywords).toContain("machine learning");
    });

    it("should extract 'project management' from description", () => {
      const keywords = extractAtsKeywords(
        "This role requires strong project management skills."
      );
      expect(keywords).toContain("project management");
    });

    it("should extract 'full-stack' and 'ci/cd' patterns", () => {
      const keywords = extractAtsKeywords(
        "Looking for a full-stack developer with ci/cd experience."
      );
      expect(keywords).toContain("full-stack");
      expect(keywords).toContain("ci/cd");
    });

    it("should extract 'front-end' and 'back-end'", () => {
      const keywords = extractAtsKeywords(
        "We need front-end and back-end engineers."
      );
      expect(keywords).toContain("front-end");
      expect(keywords).toContain("back-end");
    });

    it("should extract 'data science' and 'data analysis'", () => {
      const keywords = extractAtsKeywords(
        "This role combines data science and data analysis."
      );
      expect(keywords).toContain("data science");
      expect(keywords).toContain("data analysis");
    });

    it("should extract 'user experience' and 'user interface'", () => {
      const keywords = extractAtsKeywords(
        "Focus on user experience and user interface design."
      );
      expect(keywords).toContain("user experience");
      expect(keywords).toContain("user interface");
    });

    it("should extract 'cross-functional' and 'team leadership'", () => {
      const keywords = extractAtsKeywords(
        "Must have cross-functional and team leadership abilities."
      );
      expect(keywords).toContain("cross-functional");
      expect(keywords).toContain("team leadership");
    });

    it("should extract 'agile methodology'", () => {
      const keywords = extractAtsKeywords(
        "Experience with agile methodology preferred."
      );
      expect(keywords).toContain("agile methodology");
    });

    it("should extract 'quality assurance' and 'dev-ops'", () => {
      const keywords = extractAtsKeywords(
        "Quality assurance and dev-ops are core to this team."
      );
      expect(keywords).toContain("quality assurance");
      expect(keywords).toContain("dev-ops");
    });
  });

  describe("case insensitivity for patterns", () => {
    it("should match patterns regardless of case in description", () => {
      const keywords = extractAtsKeywords(
        "MACHINE LEARNING and Deep Learning are required."
      );
      expect(keywords).toContain("machine learning");
      expect(keywords).toContain("deep learning");
    });
  });

  describe("capitalized terms extraction", () => {
    it("should extract capitalized tool/framework names", () => {
      const keywords = extractAtsKeywords(
        "Must know React, TypeScript, and Docker."
      );
      expect(keywords).toContain("React");
      expect(keywords).toContain("TypeScript");
      expect(keywords).toContain("Docker");
    });

    it("should extract multi-word capitalized terms", () => {
      const keywords = extractAtsKeywords(
        "Experience with Amazon Web Services or Google Cloud Platform."
      );
      expect(keywords.some((k) => k.includes("Amazon"))).toBe(true);
      expect(keywords.some((k) => k.includes("Google"))).toBe(true);
    });

    it("should skip generic words (The, This, With, etc.)", () => {
      const keywords = extractAtsKeywords(
        "The candidate should have This skill. With experience From industry."
      );
      expect(keywords).not.toContain("The");
      expect(keywords).not.toContain("This");
      expect(keywords).not.toContain("With");
      expect(keywords).not.toContain("From");
    });

    it("should skip very short capitalized terms (< 3 chars)", () => {
      const keywords = extractAtsKeywords("We use AI and ML tools.");
      // "AI" and "ML" are only 2 chars — should be skipped
      expect(keywords).not.toContain("AI");
      expect(keywords).not.toContain("ML");
    });

    it("should skip very long capitalized terms (> 40 chars)", () => {
      const longTerm = "A".repeat(41);
      const keywords = extractAtsKeywords(`Experience with ${longTerm} platform.`);
      expect(keywords).not.toContain(longTerm);
    });
  });

  describe("edge cases", () => {
    it("should return empty array for empty string", () => {
      expect(extractAtsKeywords("")).toEqual([]);
    });

    it("should return empty array for lowercase-only text with no keyword patterns", () => {
      expect(extractAtsKeywords("just a simple description here")).toEqual([]);
    });

    it("should limit results to 30 keywords max", () => {
      // Build a description with many capitalized terms
      const terms = Array.from(
        { length: 40 },
        (_, i) => `Technology${i}`
      ).join(", ");
      const keywords = extractAtsKeywords(terms);
      expect(keywords.length).toBeLessThanOrEqual(30);
    });

    it("should deduplicate keywords within the same source", () => {
      // Pattern matching finds "machine learning" once per regex match
      const keywords = extractAtsKeywords(
        "We use machine learning and also machine learning models."
      );
      const mlCount = keywords.filter(
        (k) => k === "machine learning"
      ).length;
      expect(mlCount).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// findSkillOverlap()
// ---------------------------------------------------------------------------
describe("findSkillOverlap", () => {
  it("should find matching skills (case-insensitive)", () => {
    const result = findSkillOverlap(
      ["React", "TypeScript", "Python"],
      ["react", "python", "Go"]
    );
    expect(result.matching).toEqual(["react", "python"]);
    expect(result.missing).toEqual(["Go"]);
  });

  it("should return empty matching when no overlap", () => {
    const result = findSkillOverlap(["Java", "C++"], ["Python", "Go"]);
    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual(["Python", "Go"]);
  });

  it("should return empty missing when all job skills match", () => {
    const result = findSkillOverlap(
      ["React", "TypeScript", "Node.js"],
      ["React", "TypeScript"]
    );
    expect(result.matching).toEqual(["React", "TypeScript"]);
    expect(result.missing).toEqual([]);
  });

  it("should handle empty user skills", () => {
    const result = findSkillOverlap([], ["React", "Python"]);
    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual(["React", "Python"]);
  });

  it("should handle empty job skills", () => {
    const result = findSkillOverlap(["React", "Python"], []);
    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("should handle both empty", () => {
    const result = findSkillOverlap([], []);
    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("should trim whitespace during comparison", () => {
    const result = findSkillOverlap(["  React  "], ["react"]);
    expect(result.matching).toEqual(["react"]);
    expect(result.missing).toEqual([]);
  });

  it("should preserve original job skill casing in output", () => {
    const result = findSkillOverlap(["typescript"], ["TypeScript"]);
    expect(result.matching).toEqual(["TypeScript"]);
  });
});

// ---------------------------------------------------------------------------
// getFormatTips()
// ---------------------------------------------------------------------------
describe("getFormatTips", () => {
  it("should return base tips for null job level", () => {
    const tips = getFormatTips(null);
    expect(tips.length).toBe(8); // 8 base tips
    expect(tips[0]).toContain("single-column layout");
    expect(tips[4]).toContain("action verb");
  });

  it("should add senior-level tips for 'Senior' level", () => {
    const tips = getFormatTips("Senior Engineer");
    expect(tips.length).toBe(10); // 8 base + 2 senior
    expect(tips.some((t) => t.includes("leadership experience"))).toBe(true);
    expect(tips.some((t) => t.includes("cross-team collaboration"))).toBe(true);
  });

  it("should add senior-level tips for 'Lead' level", () => {
    const tips = getFormatTips("Lead");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("leadership experience"))).toBe(true);
  });

  it("should add senior-level tips for 'Principal' level", () => {
    const tips = getFormatTips("Principal");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("leadership experience"))).toBe(true);
  });

  it("should add entry-level tips for 'Entry Level' level", () => {
    const tips = getFormatTips("Entry Level");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("coursework"))).toBe(true);
    expect(tips.some((t) => t.includes("academic achievements"))).toBe(true);
  });

  it("should add entry-level tips for 'Junior' level", () => {
    const tips = getFormatTips("Junior");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("coursework"))).toBe(true);
  });

  it("should add entry-level tips for 'Intern' level", () => {
    const tips = getFormatTips("Internship Position");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("coursework"))).toBe(true);
  });

  it("should add manager-level tips for 'Manager' level", () => {
    const tips = getFormatTips("Manager");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("executive summary"))).toBe(true);
    expect(tips.some((t) => t.includes("budgets controlled"))).toBe(true);
  });

  it("should add manager-level tips for 'Director' level", () => {
    const tips = getFormatTips("Director");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("executive summary"))).toBe(true);
  });

  it("should add manager-level tips for 'VP' level", () => {
    const tips = getFormatTips("VP of Engineering");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("executive summary"))).toBe(true);
  });

  it("should return only base tips for unrecognized level", () => {
    const tips = getFormatTips("Mid-Level");
    expect(tips.length).toBe(8);
  });

  it("should be case-insensitive for level matching", () => {
    const seniorTips = getFormatTips("SENIOR ENGINEER");
    expect(seniorTips.length).toBe(10);

    const juniorTips = getFormatTips("JUNIOR DEVELOPER");
    expect(juniorTips.length).toBe(10);
  });
});
