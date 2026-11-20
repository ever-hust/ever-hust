import { tailorResumeTool } from "./tailor-resume";
import { generateValidatedObject } from "../structured";

// Rows returned by successive `db.select(...).from(...).where(...).limit(1)` calls:
// the tool reads the job first, then the user.
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
  };
});

jest.mock("../structured", () => ({
  ...jest.requireActual("../structured"),
  generateValidatedObject: jest.fn(),
}));

describe("tailorResumeTool CV keyword evidence", () => {
  it("splits the job skills and suggested keywords by the user's own CV", async () => {
    const roles = Array.from({ length: 8 }, (_, i) => ({
      title: `Engineer ${i}`,
      company: `Co ${i}`,
      description: "General duties.",
    }));
    mockRows.length = 0;
    mockRows.push(
      [
        {
          title: "Platform Engineer",
          description: "Run our clusters.",
          skills: ["Kubernetes", "Terraform", "x".repeat(150)],
        },
      ],
      [
        {
          name: "Ada",
          headline: "Backend engineer",
          skills: ["TypeScript"],
          cvParsedData: {
            summary: "Builds APIs.",
            experience: [
              ...roles,
              {
                title: "SRE",
                company: "Acme",
                description: "Operated Kubernetes clusters.",
              },
            ],
          },
        },
      ],
    );
    (generateValidatedObject as jest.Mock).mockResolvedValueOnce({
      professionalSummary: "Backend engineer who builds APIs.",
      bulletSuggestions: ["Built APIs.", "Ran clusters.", "Wrote TypeScript."],
      keywordsToAlign: ["TypeScript", "Kafka"],
      atsTips: [],
    });

    const r = (await tailorResumeTool.execute!(
      { jobId: 1, userId: "u1", model: {} } as never,
      {} as never,
    )) as Record<string, unknown>;

    // The 150-character job skill is skipped instead of failing the artifact build; the
    // Kubernetes evidence sits in the ninth role's description.
    expect(r.tailored).toBe(true);
    expect(r.keywordsInCv).toEqual(["Kubernetes", "TypeScript"]);
    expect(r.keywordsNotInCv).toEqual(["Terraform", "Kafka"]);
  });
});
