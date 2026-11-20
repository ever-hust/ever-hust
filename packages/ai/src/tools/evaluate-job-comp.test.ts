import { runEvaluateJob } from "./evaluate-job";
import { generateValidatedObject } from "../structured";

// Rows returned by successive `db.select(...).from(...).where(...).limit(1)` calls:
// runEvaluateJob reads the job first, then the user.
const mockRows: unknown[][] = [];

jest.mock("@ever-hust/db", () => {
  const query = () => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.where = () => q;
    q.limit = () => Promise.resolve(mockRows.shift() ?? []);
    return q;
  };
  return {
    db: { select: () => query() },
    jobs: { id: {} },
    users: { id: {} },
    evaluations: {},
  };
});

// Stop right after the deterministic scores are computed: the prompt handed to the LLM
// carries the comp fact and the salary line, so no model or persistence is needed.
jest.mock("../structured", () => ({
  ...jest.requireActual("../structured"),
  generateValidatedObject: jest.fn(() =>
    Promise.reject(new Error("stop before LLM")),
  ),
}));

const baseJob: Record<string, unknown> = {
  id: 7,
  title: "Backend Engineer",
  companyName: "Acme",
  companyIndustry: null,
  description: "Build APIs.",
  skills: [],
  isRemote: true,
  jobLevel: null,
  locationCity: null,
  locationState: null,
  locationCountry: null,
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: "USD",
  salaryInterval: null,
  legitimacy: null,
  legitimacyReasons: null,
};

/** The "Comp dimension:" and "Salary:" prompt lines for a job row (DB numerics are strings). */
async function compLinesFor(
  job: Record<string, unknown>,
): Promise<{ comp?: string; salary?: string }> {
  mockRows.length = 0;
  mockRows.push(
    [{ ...baseJob, ...job }],
    [
      {
        skills: [],
        cvParsedData: null,
        preferences: { salaryMin: 150000 },
      },
    ],
  );
  (generateValidatedObject as jest.Mock).mockClear();
  await expect(
    runEvaluateJob({ jobId: 7, userId: "user_1", model: {} as never }),
  ).rejects.toThrow("stop before LLM");
  const { prompt } = (generateValidatedObject as jest.Mock).mock
    .calls[0][0] as { prompt: string };
  const lines = prompt.split("\n");
  return {
    comp: lines.find((line) => line.startsWith("Comp dimension:")),
    salary: lines.find((line) => line.startsWith("Salary:")),
  };
}

describe("runEvaluateJob comp dimension uses the posting's pay period", () => {
  it("annualises an hourly posting read from the job row", async () => {
    expect(
      await compLinesFor({
        salaryMin: "90",
        salaryMax: "110",
        salaryInterval: "hourly",
      }),
    ).toEqual({
      comp: "Comp dimension: 5/5 — Posting midpoint ~$208k vs your target ~$150k (139%). (budgetFit=good_fit)",
      salary: "Salary: 90–110 USD (hourly)",
    });
  });

  it("annualises a daily rate", async () => {
    expect(
      await compLinesFor({ salaryMin: "800", salaryInterval: "daily" }),
    ).toEqual({
      comp: "Comp dimension: 5/5 — Posting midpoint ~$208k vs your target ~$150k (139%). (budgetFit=good_fit)",
      salary: "Salary: 800–— USD (daily)",
    });
  });

  it("leaves a posting without a pay period as it was", async () => {
    expect(
      await compLinesFor({ salaryMin: "180000", salaryMax: "220000" }),
    ).toEqual({
      comp: "Comp dimension: 5/5 — Posting midpoint ~$200k vs your target ~$150k (133%). (budgetFit=good_fit)",
      salary: "Salary: 180000–220000 USD",
    });
  });
});
