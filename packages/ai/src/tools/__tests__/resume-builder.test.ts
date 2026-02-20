import {
  extractAtsKeywords,
  findSkillOverlap,
  getFormatTips,
} from "../resume-helpers";

// ---------------------------------------------------------------------------
// extractAtsKeywords
// ---------------------------------------------------------------------------
describe("extractAtsKeywords", () => {
  it("should find multi-word professional terms like 'machine learning' and 'project management'", () => {
    const description =
      "We are looking for someone skilled in machine learning and project management to lead our data team.";
    const keywords = extractAtsKeywords(description);

    expect(keywords).toContain("machine learning");
    expect(keywords).toContain("project management");
  });

  it("should find capitalized technical terms like React, AWS, Python", () => {
    const description =
      "The ideal candidate has experience with React, AWS, and Python in a production environment.";
    const keywords = extractAtsKeywords(description);

    expect(keywords).toContain("React");
    expect(keywords).toContain("AWS");
    expect(keywords).toContain("Python");
  });

  it("should filter out generic words (The, This, That, With, From, About, Your)", () => {
    const description =
      "The company is looking for This kind of talent. That person should come From a strong background. About five years of experience. With great communication. Your resume should reflect this.";
    const keywords = extractAtsKeywords(description);

    expect(keywords).not.toContain("The");
    expect(keywords).not.toContain("This");
    expect(keywords).not.toContain("That");
    expect(keywords).not.toContain("With");
    expect(keywords).not.toContain("From");
    expect(keywords).not.toContain("About");
    expect(keywords).not.toContain("Your");
  });

  it("should return an empty array for an empty description", () => {
    const keywords = extractAtsKeywords("");
    expect(keywords).toEqual([]);
  });

  it("should cap the result at 30 keywords", () => {
    // Build a description with many capitalized terms to exceed 30
    const capitalizedTerms = Array.from({ length: 40 }, (_, i) => `Toolname${i}`);
    const description = capitalizedTerms.join(" uses ") + ".";
    const keywords = extractAtsKeywords(description);

    expect(keywords.length).toBeLessThanOrEqual(30);
  });

  it("should handle mixed case by finding both lowercased multi-word terms and capitalized terms", () => {
    const description =
      "Our team uses Deep Learning techniques and Kubernetes for orchestration. Candidates need AWS experience. We follow Agile Methodology daily.";
    const keywords = extractAtsKeywords(description);

    // The multi-word regex matches on lowercased text
    expect(keywords).toContain("deep learning");
    // Capitalized terms from original text
    expect(keywords).toContain("Deep Learning");
    expect(keywords).toContain("AWS");
    expect(keywords).toContain("Kubernetes");
    expect(keywords).toContain("Agile Methodology");
  });

  it("should find hyphenated variants like full-stack and front-end", () => {
    const description =
      "We need a full-stack developer with front-end and back-end experience, plus dev-ops skills.";
    const keywords = extractAtsKeywords(description);

    expect(keywords).toContain("full-stack");
    expect(keywords).toContain("front-end");
    expect(keywords).toContain("back-end");
    expect(keywords).toContain("dev-ops");
  });

  it("should find space-separated variants like 'full stack' and 'front end'", () => {
    const description =
      "Looking for a full stack engineer with front end experience.";
    const keywords = extractAtsKeywords(description);

    expect(keywords).toContain("full stack");
    expect(keywords).toContain("front end");
  });

  it("should find ci/cd as a keyword", () => {
    const description = "Experience with ci/cd pipelines is required.";
    const keywords = extractAtsKeywords(description);

    expect(keywords).toContain("ci/cd");
  });

  it("should not include terms shorter than 3 characters from capitalized extraction", () => {
    // "AI" is only 2 chars, so it should be excluded by the length >= 3 filter
    const description = "AI and ML are important. Use Go for backend.";
    const keywords = extractAtsKeywords(description);

    expect(keywords).not.toContain("AI");
    expect(keywords).not.toContain("ML");
    // "Go" is 2 characters -- also excluded
    expect(keywords).not.toContain("Go");
  });

  it("should deduplicate keywords", () => {
    const description =
      "machine learning and machine learning again. React and React are both used.";
    const keywords = extractAtsKeywords(description);

    const mlCount = keywords.filter((k) => k === "machine learning").length;
    expect(mlCount).toBe(1);

    const reactCount = keywords.filter((k) => k === "React").length;
    expect(reactCount).toBe(1);
  });

  it("should handle a description with no recognizable keywords", () => {
    const description = "we need someone who can do stuff well and is nice.";
    const keywords = extractAtsKeywords(description);

    expect(keywords).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findSkillOverlap
// ---------------------------------------------------------------------------
describe("findSkillOverlap", () => {
  it("should find exact matches case-insensitively", () => {
    const result = findSkillOverlap(
      ["react", "TypeScript", "NODE.JS"],
      ["React", "typescript", "Node.js", "GraphQL"]
    );

    expect(result.matching).toEqual(["React", "typescript", "Node.js"]);
    expect(result.missing).toEqual(["GraphQL"]);
  });

  it("should return all matching when user has every job skill", () => {
    const result = findSkillOverlap(
      ["Python", "Django", "PostgreSQL"],
      ["python", "django", "postgresql"]
    );

    expect(result.matching).toEqual(["python", "django", "postgresql"]);
    expect(result.missing).toEqual([]);
  });

  it("should return all missing when user has none of the job skills", () => {
    const result = findSkillOverlap(
      ["Java", "Spring"],
      ["Python", "Django", "FastAPI"]
    );

    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual(["Python", "Django", "FastAPI"]);
  });

  it("should handle empty user skills", () => {
    const result = findSkillOverlap([], ["React", "TypeScript"]);

    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual(["React", "TypeScript"]);
  });

  it("should handle empty job skills", () => {
    const result = findSkillOverlap(["React", "TypeScript"], []);

    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("should handle both arrays empty", () => {
    const result = findSkillOverlap([], []);

    expect(result.matching).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("should preserve the original casing of job skills in the output", () => {
    const result = findSkillOverlap(
      ["REACT", "typescript"],
      ["React", "TypeScript", "Next.js"]
    );

    // matching array should contain job-skill casing, not user-skill casing
    expect(result.matching).toContain("React");
    expect(result.matching).toContain("TypeScript");
    expect(result.matching).not.toContain("REACT");
    expect(result.matching).not.toContain("typescript");

    expect(result.missing).toEqual(["Next.js"]);
  });

  it("should handle skills with leading/trailing whitespace", () => {
    const result = findSkillOverlap(
      ["  React  ", "TypeScript"],
      ["react", "  typescript  "]
    );

    expect(result.matching).toEqual(["react", "  typescript  "]);
    expect(result.missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFormatTips
// ---------------------------------------------------------------------------
describe("getFormatTips", () => {
  it("should return exactly 8 base tips when jobLevel is null", () => {
    const tips = getFormatTips(null);

    expect(tips).toHaveLength(8);
    expect(tips[0]).toContain("single-column layout");
    expect(tips[7]).toContain("1-2 pages");
  });

  it("should return 10 tips for 'senior' level (8 base + 2 senior)", () => {
    const tips = getFormatTips("senior");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("leadership experience");
    expect(tips[9]).toContain("cross-team collaboration");
  });

  it("should return 10 tips for 'lead' level (8 base + 2 senior)", () => {
    const tips = getFormatTips("lead");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("leadership experience");
    expect(tips[9]).toContain("cross-team collaboration");
  });

  it("should return 10 tips for 'principal' level (8 base + 2 senior)", () => {
    const tips = getFormatTips("principal");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("leadership experience");
    expect(tips[9]).toContain("cross-team collaboration");
  });

  it("should return 10 tips for 'entry' level (8 base + 2 entry)", () => {
    const tips = getFormatTips("entry");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("relevant coursework");
    expect(tips[9]).toContain("academic achievements");
  });

  it("should return 10 tips for 'junior' level (8 base + 2 entry)", () => {
    const tips = getFormatTips("junior");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("relevant coursework");
    expect(tips[9]).toContain("academic achievements");
  });

  it("should return 10 tips for 'intern' level (8 base + 2 entry)", () => {
    const tips = getFormatTips("intern");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("relevant coursework");
    expect(tips[9]).toContain("academic achievements");
  });

  it("should return 10 tips for 'manager' level (8 base + 2 manager)", () => {
    const tips = getFormatTips("manager");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("executive summary");
    expect(tips[9]).toContain("team sizes managed");
  });

  it("should return 10 tips for 'director' level (8 base + 2 manager)", () => {
    const tips = getFormatTips("director");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("executive summary");
    expect(tips[9]).toContain("team sizes managed");
  });

  it("should return 10 tips for 'vp' level (8 base + 2 manager)", () => {
    const tips = getFormatTips("vp");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("executive summary");
    expect(tips[9]).toContain("team sizes managed");
  });

  it("should return only 8 base tips for 'mid' level (no match)", () => {
    const tips = getFormatTips("mid");

    expect(tips).toHaveLength(8);
  });

  it("should be case-insensitive for job level matching", () => {
    const tipsUpper = getFormatTips("SENIOR");
    const tipsLower = getFormatTips("senior");
    const tipsMixed = getFormatTips("Senior");

    expect(tipsUpper).toEqual(tipsLower);
    expect(tipsLower).toEqual(tipsMixed);
  });

  it("should match levels embedded in longer strings", () => {
    // The function uses .includes(), so "Senior Software Engineer" should match "senior"
    const tips = getFormatTips("Senior Software Engineer");

    expect(tips).toHaveLength(10);
    expect(tips[8]).toContain("leadership experience");
  });

  it("should return a fresh array each call (no mutation leaks)", () => {
    const tips1 = getFormatTips(null);
    const tips2 = getFormatTips(null);

    expect(tips1).toEqual(tips2);
    expect(tips1).not.toBe(tips2); // different references
  });
});
