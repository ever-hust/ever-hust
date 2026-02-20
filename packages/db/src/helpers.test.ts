import { escapeIlike } from "./helpers";

describe("escapeIlike", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeIlike("hello world")).toBe("hello world");
  });

  it("escapes percent signs", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("%match%")).toBe("\\%match\\%");
  });

  it("escapes underscores", () => {
    expect(escapeIlike("user_name")).toBe("user\\_name");
    expect(escapeIlike("_start")).toBe("\\_start");
  });

  it("escapes backslashes", () => {
    expect(escapeIlike("path\\to")).toBe("path\\\\to");
    expect(escapeIlike("\\")).toBe("\\\\");
  });

  it("escapes all special characters together", () => {
    expect(escapeIlike("100%_test\\path")).toBe("100\\%\\_test\\\\path");
  });

  it("handles empty string", () => {
    expect(escapeIlike("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(escapeIlike("%_%\\")).toBe("\\%\\_\\%\\\\");
  });

  it("preserves unicode characters", () => {
    expect(escapeIlike("café_100%")).toBe("café\\_100\\%");
  });

  it("handles multiple consecutive special characters", () => {
    expect(escapeIlike("%%__\\\\")).toBe("\\%\\%\\_\\_\\\\\\\\");
  });

  it("preserves already-escaped input (double-escapes)", () => {
    // If input already contains \%, it should be escaped again
    expect(escapeIlike("100\\%")).toBe("100\\\\\\%");
  });

  it("handles very long strings", () => {
    const long = "a".repeat(10000) + "%" + "b".repeat(10000);
    const result = escapeIlike(long);
    expect(result).toBe("a".repeat(10000) + "\\%" + "b".repeat(10000));
    expect(result.length).toBe(20002);
  });

  it("handles strings with newlines and tabs", () => {
    expect(escapeIlike("line1\nline2\t%")).toBe("line1\nline2\t\\%");
  });

  it("escapes backslashes before wildcards (order matters)", () => {
    // Input: \% → should become \\% (backslash escaped, then % escaped)
    // NOT \\\% — the order of replace operations matters
    const result = escapeIlike("\\%");
    expect(result).toBe("\\\\\\%");
  });
});
