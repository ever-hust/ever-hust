import { describe, it, expect } from "@jest/globals";
import { escapeIlike } from "@ever-hust/db";

describe("escapeIlike", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeIlike("software engineer")).toBe("software engineer");
  });

  it("escapes percent signs", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("%admin%")).toBe("\\%admin\\%");
  });

  it("escapes underscores", () => {
    expect(escapeIlike("job_title")).toBe("job\\_title");
    expect(escapeIlike("__init__")).toBe("\\_\\_init\\_\\_");
  });

  it("escapes backslashes", () => {
    expect(escapeIlike("path\\to")).toBe("path\\\\to");
  });

  it("escapes all special characters together", () => {
    expect(escapeIlike("100%_\\done")).toBe("100\\%\\_\\\\done");
  });

  it("returns empty string unchanged", () => {
    expect(escapeIlike("")).toBe("");
  });

  it("handles strings with only special characters", () => {
    expect(escapeIlike("%_%")).toBe("\\%\\_\\%");
  });

  it("preserves spaces and other non-special characters", () => {
    expect(escapeIlike("San Francisco, CA")).toBe("San Francisco, CA");
  });

  it("handles multiple consecutive special chars", () => {
    expect(escapeIlike("%%__")).toBe("\\%\\%\\_\\_");
  });
});
