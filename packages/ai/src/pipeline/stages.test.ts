import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  TERMINAL_STAGES,
  ACTIVE_STAGES,
  isValidStage,
  isTerminalStage,
} from "./stages";

describe("pipeline stages", () => {
  it("defines a label for every stage", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
    }
  });

  it("validates known stages and rejects unknown ones", () => {
    expect(isValidStage("interviewing")).toBe(true);
    expect(isValidStage("offer")).toBe(true);
    expect(isValidStage("ghosted")).toBe(false);
    expect(isValidStage("")).toBe(false);
  });

  it("marks rejected/withdrawn as terminal", () => {
    expect(isTerminalStage("rejected")).toBe(true);
    expect(isTerminalStage("withdrawn")).toBe(true);
    expect(isTerminalStage("interviewing")).toBe(false);
  });

  it("ACTIVE_STAGES excludes terminal stages", () => {
    for (const t of TERMINAL_STAGES) {
      expect(ACTIVE_STAGES).not.toContain(t);
    }
    expect(ACTIVE_STAGES).toContain("applied");
    expect(ACTIVE_STAGES).toContain("interviewing");
  });
});
