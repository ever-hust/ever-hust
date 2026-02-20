import {
  extractAtsKeywords,
  findSkillOverlap,
  getFormatTips,
} from "./resume-helpers";

describe("extractAtsKeywords", () => {
  it("extracts multi-word ATS phrases", () => {
    const result = extractAtsKeywords(
      "We need someone with machine learning and project management experience."
    );
    expect(result).toContain("machine learning");
    expect(result).toContain("project management");
  });

  it("extracts CI/CD pattern", () => {
    const result = extractAtsKeywords(
      "Experience with CI/CD pipelines and version control is required."
    );
    expect(result).toContain("ci/cd");
    expect(result).toContain("version control");
  });

  it("extracts hyphenated terms (full-stack, front-end, etc.)", () => {
    const result = extractAtsKeywords(
      "Looking for a full-stack developer with front-end expertise."
    );
    expect(result).toContain("full-stack");
    expect(result).toContain("front-end");
  });

  it("extracts capitalized proper nouns (tools, frameworks)", () => {
    const result = extractAtsKeywords(
      "Experience with React and TypeScript is required. Knowledge of Docker and AWS is a plus."
    );
    expect(result).toContain("React");
    expect(result).toContain("TypeScript");
    expect(result).toContain("Docker");
  });

  it("skips common generic words (The, This, That, etc.)", () => {
    const result = extractAtsKeywords(
      "The ideal candidate should have experience. This is about React."
    );
    expect(result).not.toContain("The");
    expect(result).not.toContain("This");
    expect(result).toContain("React");
  });

  it("limits output to 30 keywords", () => {
    // Create a description with many capitalized terms
    const terms = Array.from({ length: 50 }, (_, i) => `ToolName${i}`).join(
      " and "
    );
    const result = extractAtsKeywords(terms);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("returns empty array for empty input", () => {
    expect(extractAtsKeywords("")).toEqual([]);
  });

  it("handles lowercase-only input with no ATS patterns", () => {
    const result = extractAtsKeywords(
      "we need someone who can work well with the team"
    );
    // No capitalized terms, no ATS patterns
    expect(result.length).toBe(0);
  });

  it("deduplicates keywords", () => {
    const result = extractAtsKeywords(
      "React and React are both mentioned. Also machine learning and machine learning."
    );
    const reactCount = result.filter((k) => k === "React").length;
    expect(reactCount).toBeLessThanOrEqual(1);
  });
});

describe("findSkillOverlap", () => {
  it("finds matching and missing skills", () => {
    const userSkills = ["React", "TypeScript", "Node.js"];
    const jobSkills = ["React", "Python", "TypeScript", "Docker"];
    const result = findSkillOverlap(userSkills, jobSkills);
    expect(result.matching).toEqual(["React", "TypeScript"]);
    expect(result.missing).toEqual(["Python", "Docker"]);
  });

  it("is case-insensitive", () => {
    const userSkills = ["react", "typescript"];
    const jobSkills = ["React", "TypeScript"];
    const result = findSkillOverlap(userSkills, jobSkills);
    expect(result.matching).toEqual(["React", "TypeScript"]);
    expect(result.missing).toEqual([]);
  });

  it("trims whitespace in skill names", () => {
    const userSkills = [" React ", " Node.js "];
    const jobSkills = ["React", "Node.js"];
    const result = findSkillOverlap(userSkills, jobSkills);
    expect(result.matching).toEqual(["React", "Node.js"]);
  });

  it("returns all as missing when no overlap", () => {
    const result = findSkillOverlap(["A", "B"], ["X", "Y"]);
    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual(["X", "Y"]);
  });

  it("returns all as matching when full overlap", () => {
    const result = findSkillOverlap(
      ["React", "Node.js"],
      ["React", "Node.js"]
    );
    expect(result.matching).toEqual(["React", "Node.js"]);
    expect(result.missing).toEqual([]);
  });

  it("handles empty user skills", () => {
    const result = findSkillOverlap([], ["React", "Python"]);
    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual(["React", "Python"]);
  });

  it("handles empty job skills", () => {
    const result = findSkillOverlap(["React", "Python"], []);
    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual([]);
  });
});

describe("getFormatTips", () => {
  it("returns base tips for null job level", () => {
    const tips = getFormatTips(null);
    expect(tips.length).toBe(8);
    expect(tips[0]).toContain("single-column layout");
  });

  it("adds senior-level tips for senior roles", () => {
    const tips = getFormatTips("Senior Software Engineer");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("leadership"))).toBe(true);
  });

  it("adds senior-level tips for lead roles", () => {
    const tips = getFormatTips("Tech Lead");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("leadership"))).toBe(true);
  });

  it("adds senior-level tips for principal roles", () => {
    const tips = getFormatTips("Principal Engineer");
    expect(tips.length).toBe(10);
  });

  it("adds entry-level tips for junior roles", () => {
    const tips = getFormatTips("Junior Developer");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("coursework"))).toBe(true);
  });

  it("adds entry-level tips for intern roles", () => {
    const tips = getFormatTips("Summer Intern");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("certifications"))).toBe(true);
  });

  it("adds manager-level tips for manager roles", () => {
    const tips = getFormatTips("Engineering Manager");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("executive summary"))).toBe(true);
  });

  it("adds manager-level tips for director roles", () => {
    const tips = getFormatTips("Director of Engineering");
    expect(tips.length).toBe(10);
    expect(tips.some((t) => t.includes("team sizes"))).toBe(true);
  });

  it("adds manager-level tips for VP roles", () => {
    const tips = getFormatTips("VP of Product");
    expect(tips.length).toBe(10);
  });

  it("returns only base tips for mid-level roles", () => {
    const tips = getFormatTips("Software Engineer");
    expect(tips.length).toBe(8);
  });

  it("is case-insensitive", () => {
    const tips = getFormatTips("SENIOR ENGINEER");
    expect(tips.length).toBe(10);
  });
});
