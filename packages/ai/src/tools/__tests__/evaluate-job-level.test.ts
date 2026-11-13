import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// No live services: the database, drizzle's `eq` and the LLM call are all replaced.
jest.mock("@ever-hust/db", () => {
  const table = (name: string) =>
    new Proxy({}, { get: (_t, prop) => `${name}.${String(prop)}` });
  return {
    db: { select: jest.fn(), insert: jest.fn() },
    jobs: table("jobs"),
    users: table("users"),
    evaluations: table("evaluations"),
  };
});
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));
jest.mock("../../structured", () => ({
  ...(jest.requireActual("../../structured") as object),
  generateValidatedObject: jest.fn(),
}));

import { db } from "@ever-hust/db";
import { generateValidatedObject, type EvaluationLlmPart } from "../../structured";
import { runEvaluateJob } from "../evaluate-job";

const llmPart: EvaluationLlmPart = {
  dimensions: [
    { key: "north_star", score5: 4, rationale: "Close to the target role." },
    { key: "cv_match", score5: 4, rationale: "Strong overlap." },
    { key: "growth", score5: 4, rationale: "Clear path." },
    { key: "reputation", score5: 4, rationale: "Solid employer." },
    { key: "tech", score5: 4, rationale: "Modern stack." },
    { key: "speed", score5: 3, rationale: "Average process." },
    { key: "culture", score5: 4, rationale: "Builder culture." },
  ],
  blocks: {
    roleSummary: "Backend role.",
    cvMatch: { evidence: [], gaps: [] },
    levelStrategy: "Position as senior.",
    compDemand: { summary: "Within band.", budgetFit: "good_fit" },
    customization: "Emphasize reliability.",
  },
  recommendation: "Apply.",
};

const seniorJob = {
  id: 1,
  title: "Backend Engineer",
  companyName: "Acme",
  companyIndustry: null,
  description: "Build services.",
  skills: [],
  isRemote: true,
  jobLevel: "Senior",
  locationCity: null,
  locationState: null,
  locationCountry: null,
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  legitimacy: null,
  legitimacyReasons: null,
};

/** Queue the two reads `runEvaluateJob` makes: the job row, then the user row. */
function queueReads(roleLevel: unknown) {
  const user = {
    skills: [],
    cvParsedData: {},
    preferences: roleLevel === undefined ? {} : { roleLevel },
  };
  const rows = [[seniorJob], [user]];
  (db.select as jest.Mock).mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: async () => rows.shift() }) }),
  }));
}

async function levelDimension(roleLevel: unknown) {
  queueReads(roleLevel);
  const result = await runEvaluateJob({
    jobId: 1,
    userId: "user-1",
    model: "test-model" as never,
  });
  if (!result.evaluated) throw new Error(`evaluation failed: ${result.error}`);
  return result.dimensions.find((d) => d.key === "level");
}

describe("runEvaluateJob level score with the saved roleLevel preference", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (generateValidatedObject as jest.Mock).mockResolvedValue(llmPart as never);
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    }));
  });

  it("scores 5 for an array preference ['senior'] against a Senior job (as saved by onboarding)", async () => {
    const level = await levelDimension(["senior"]);
    expect(level?.score5).toBe(5);
    expect(level?.rationale).toBe("Role is at your level.");
  });

  it("scores 5 for a string preference", async () => {
    expect((await levelDimension("senior"))?.score5).toBe(5);
  });

  it("uses the closest of several saved levels", async () => {
    expect((await levelDimension(["junior", "senior"]))?.score5).toBe(5);
  });

  it("stays neutral (3) for an empty array and for a missing preference", async () => {
    expect((await levelDimension([]))?.score5).toBe(3);
    expect((await levelDimension(undefined))?.score5).toBe(3);
  });
});
