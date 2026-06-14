import { aggregateGaps } from "./gaps";

describe("aggregateGaps", () => {
  it("counts and ranks recurring gaps (case-insensitive)", () => {
    const result = aggregateGaps([
      { gaps: ["Kubernetes", "GraphQL"] },
      { gaps: ["kubernetes", "Terraform"] },
      { gaps: ["Kubernetes"] },
    ]);
    expect(result[0]).toEqual({ skill: "Kubernetes", frequency: 3 });
    expect(result.map((g) => g.skill)).toContain("GraphQL");
  });

  it("ignores empty / non-string gaps", () => {
    const result = aggregateGaps([{ gaps: ["", "  "] }, { gaps: [] }]);
    expect(result).toEqual([]);
  });

  it("respects the limit", () => {
    const items = [{ gaps: ["a", "b", "c", "d"] }];
    expect(aggregateGaps(items, 2)).toHaveLength(2);
  });
});
