import { extractBasicInfo } from "./index";

describe("extractBasicInfo", () => {
  it("should extract email from CV text", () => {
    const text = "John Doe\njohn.doe@example.com\n+1 555-123-4567";
    const result = extractBasicInfo(text);
    expect(result.email).toBe("john.doe@example.com");
  });

  it("should extract phone number from CV text", () => {
    const text = "John Doe\njohn@example.com\n+1 555-123-4567";
    const result = extractBasicInfo(text);
    expect(result.phone).toBeTruthy();
  });

  it("should extract name from first line", () => {
    const text = "John Doe\njohn@example.com\nSenior Developer";
    const result = extractBasicInfo(text);
    expect(result.name).toBe("John Doe");
  });

  it("should not extract name if first line contains @ or digits", () => {
    const text = "john@example.com\nJohn Doe\nSenior Developer";
    const result = extractBasicInfo(text);
    expect(result.name).toBeUndefined();
  });

  it("should extract common skills", () => {
    const text =
      "Skills: JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker";
    const result = extractBasicInfo(text);
    expect(result.skills).toContain("JavaScript");
    expect(result.skills).toContain("TypeScript");
    expect(result.skills).toContain("React");
    expect(result.skills).toContain("Node.js");
    expect(result.skills).toContain("PostgreSQL");
    expect(result.skills).toContain("Docker");
  });

  it("should be case-insensitive for skill matching", () => {
    const text = "I have experience with javascript and python";
    const result = extractBasicInfo(text);
    expect(result.skills).toContain("JavaScript");
    expect(result.skills).toContain("Python");
  });

  it("should return empty skills array for unrecognized skills", () => {
    const text = "I have experience with Obscure Framework and Niche Tool";
    const result = extractBasicInfo(text);
    expect(result.skills).toEqual([]);
  });

  it("should include rawText in result", () => {
    const text = "Some CV content";
    const result = extractBasicInfo(text);
    expect(result.rawText).toBe(text);
  });
});
