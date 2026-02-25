import {
  extractBasicInfo,
  extractTextFromTXT,
  SUPPORTED_CV_MIME_TYPES,
  SUPPORTED_CV_EXTENSIONS,
} from "./index";

// ---------------------------------------------------------------------------
// extractTextFromTXT
// ---------------------------------------------------------------------------
describe("extractTextFromTXT", () => {
  it("should convert a UTF-8 buffer to string", () => {
    const text = "John Doe\nSenior Developer\nSkills: JavaScript, Python";
    const buffer = Buffer.from(text, "utf-8");
    expect(extractTextFromTXT(buffer)).toBe(text);
  });

  it("should handle an empty buffer", () => {
    const buffer = Buffer.alloc(0);
    expect(extractTextFromTXT(buffer)).toBe("");
  });

  it("should handle multi-line content with CRLF line endings", () => {
    const text = "Line 1\r\nLine 2\r\nLine 3";
    const buffer = Buffer.from(text, "utf-8");
    expect(extractTextFromTXT(buffer)).toBe(text);
  });

  it("should handle unicode characters (accented names, CJK)", () => {
    const text = "José García — Développeur\n技能: JavaScript";
    const buffer = Buffer.from(text, "utf-8");
    expect(extractTextFromTXT(buffer)).toBe(text);
  });

  it("should strip UTF-8 BOM if present", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const text = Buffer.from("John Doe\nDeveloper", "utf-8");
    const withBom = Buffer.concat([bom, text]);
    // Buffer.toString("utf-8") strips BOM automatically
    const result = extractTextFromTXT(withBom);
    expect(result).toContain("John Doe");
  });
});

// ---------------------------------------------------------------------------
// SUPPORTED_CV_MIME_TYPES
// ---------------------------------------------------------------------------
describe("SUPPORTED_CV_MIME_TYPES", () => {
  it("should include PDF MIME type", () => {
    expect(SUPPORTED_CV_MIME_TYPES.has("application/pdf")).toBe(true);
  });

  it("should include DOCX MIME type", () => {
    expect(
      SUPPORTED_CV_MIME_TYPES.has(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  it("should include plain text MIME type", () => {
    expect(SUPPORTED_CV_MIME_TYPES.has("text/plain")).toBe(true);
  });

  it("should contain exactly 3 MIME types", () => {
    expect(SUPPORTED_CV_MIME_TYPES.size).toBe(3);
  });

  it("should not include unsupported types", () => {
    expect(SUPPORTED_CV_MIME_TYPES.has("image/png")).toBe(false);
    expect(SUPPORTED_CV_MIME_TYPES.has("text/html")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SUPPORTED_CV_EXTENSIONS
// ---------------------------------------------------------------------------
describe("SUPPORTED_CV_EXTENSIONS", () => {
  it("should include pdf, docx, and txt", () => {
    expect(SUPPORTED_CV_EXTENSIONS.has("pdf")).toBe(true);
    expect(SUPPORTED_CV_EXTENSIONS.has("docx")).toBe(true);
    expect(SUPPORTED_CV_EXTENSIONS.has("txt")).toBe(true);
  });

  it("should contain exactly 3 extensions", () => {
    expect(SUPPORTED_CV_EXTENSIONS.size).toBe(3);
  });

  it("should not include unsupported extensions", () => {
    expect(SUPPORTED_CV_EXTENSIONS.has("doc")).toBe(false);
    expect(SUPPORTED_CV_EXTENSIONS.has("rtf")).toBe(false);
    expect(SUPPORTED_CV_EXTENSIONS.has("png")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractBasicInfo (original tests)
// ---------------------------------------------------------------------------
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
