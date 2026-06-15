import { assessPostingLegitimacy, LEGITIMACY_NOTE } from "./legitimacy";

describe("assessPostingLegitimacy (Block G, orthogonal to fit)", () => {
  it("honours an explicit corpus signal over the heuristic", () => {
    const r = assessPostingLegitimacy({
      corpusSignal: "verified",
      hasSalary: false,
      descriptionLength: 10,
    });
    expect(r.level).toBe("verified");
  });

  it("surfaces corpus reasons verbatim when provided", () => {
    const r = assessPostingLegitimacy({
      corpusSignal: "uncertain",
      corpusReasons: ["Redirects off-platform.", "No company-domain match."],
    });
    expect(r.reasons).toEqual(["Redirects off-platform.", "No company-domain match."]);
  });

  it("falls back to a generic reason when the corpus omits them", () => {
    const r = assessPostingLegitimacy({ corpusSignal: "likely", corpusReasons: [] });
    expect(r.reasons).toHaveLength(1);
  });

  it("flags uncertain when salary is missing AND the description is thin", () => {
    const r = assessPostingLegitimacy({ hasSalary: false, descriptionLength: 50 });
    expect(r.level).toBe("uncertain");
    expect(r.reasons).toHaveLength(2);
  });

  it("is 'likely' with a single mild concern", () => {
    expect(assessPostingLegitimacy({ hasSalary: false, descriptionLength: 1200 }).level).toBe(
      "likely",
    );
  });

  it("is 'likely' for a salaried, substantive posting", () => {
    expect(assessPostingLegitimacy({ hasSalary: true, descriptionLength: 1200 }).level).toBe(
      "likely",
    );
  });

  it("exposes a stable orthogonal-to-fit note", () => {
    expect(LEGITIMACY_NOTE).toContain("orthogonal to fit");
  });
});
