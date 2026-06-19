import { nextStageFor } from "../application-pipeline";

describe("nextStageFor (email category → pipeline stage, advance-only)", () => {
  it("rejection sets rejected from any active stage", () => {
    expect(nextStageFor("applied", "rejection")).toBe("rejected");
    expect(nextStageFor("interviewing", "rejection")).toBe("rejected");
    expect(nextStageFor("offer", "rejection")).toBe("rejected");
  });

  it("rejection is a no-op when already terminal", () => {
    expect(nextStageFor("rejected", "rejection")).toBeNull();
    expect(nextStageFor("withdrawn", "rejection")).toBeNull();
  });

  it("offer advances to offer", () => {
    expect(nextStageFor("applied", "offer")).toBe("offer");
    expect(nextStageFor("interviewing", "offer")).toBe("offer");
  });

  it("interview/scheduling advance to interviewing only from earlier stages", () => {
    expect(nextStageFor("saved", "interview")).toBe("interviewing");
    expect(nextStageFor("applied", "interview")).toBe("interviewing");
    expect(nextStageFor("screening", "scheduling")).toBe("interviewing");
    // already at/after interviewing → no change
    expect(nextStageFor("interviewing", "interview")).toBeNull();
    expect(nextStageFor("offer", "interview")).toBeNull();
  });

  it("does not move out of terminal/offer stages (except rejection)", () => {
    expect(nextStageFor("offer", "offer")).toBeNull();
    expect(nextStageFor("rejected", "interview")).toBeNull();
    expect(nextStageFor("withdrawn", "offer")).toBeNull();
  });

  it("neutral categories never change the stage", () => {
    expect(nextStageFor("applied", "recruiter")).toBeNull();
    expect(nextStageFor("applied", "application")).toBeNull();
    expect(nextStageFor("applied", "other")).toBeNull();
  });
});
