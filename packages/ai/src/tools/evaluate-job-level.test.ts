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
// carries the level fact, so no model or persistence is needed.
jest.mock("../structured", () => ({
  ...jest.requireActual("../structured"),
  generateValidatedObject: jest.fn(() => Promise.reject(new Error("stop before LLM"))),
}));

const seniorJob = {
  id: 7,
  title: "Backend Engineer",
  companyName: "Acme",
  companyIndustry: null,
  description: "Build APIs.",
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

async function levelLineFor(preferences: unknown): Promise<string | undefined> {
  mockRows.length = 0;
  mockRows.push([seniorJob], [{ skills: [], cvParsedData: null, preferences }]);
  (generateValidatedObject as jest.Mock).mockClear();
  await expect(
    runEvaluateJob({ jobId: 7, userId: "user_1", model: {} as never }),
  ).rejects.toThrow("stop before LLM");
  const { prompt } = (generateValidatedObject as jest.Mock).mock.calls[0][0] as { prompt: string };
  return prompt.split("\n").find((line) => line.startsWith("Level dimension:"));
}

describe("runEvaluateJob level dimension uses the saved roleLevel", () => {
  it("scores an array preference (as saved by onboarding / preferences API)", async () => {
    expect(await levelLineFor({ roleLevel: ["senior"] })).toBe(
      "Level dimension: 5/5 — Role is at your level.",
    );
  });

  it("still scores a string preference", async () => {
    expect(await levelLineFor({ roleLevel: "senior" })).toBe(
      "Level dimension: 5/5 — Role is at your level.",
    );
  });

  it("is neutral when no level is saved", async () => {
    expect(await levelLineFor(null)).toBe(
      "Level dimension: 3/5 — Level not clearly stated — scored neutral.",
    );
  });
});
