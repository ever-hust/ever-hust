import { assessLegitimacy } from "./legitimacy";

describe("assessLegitimacy (orthogonal to fit)", () => {
  it("honours an explicit corpus signal over the heuristic", () => {
    expect(
      assessLegitimacy({ corpusSignal: "verified", hasSalary: false, descriptionLength: 10 }).level,
    ).toBe("verified");
  });

  it("flags uncertain when salary is missing AND the description is thin", () => {
    const r = assessLegitimacy({ hasSalary: false, descriptionLength: 50 });
    expect(r.level).toBe("uncertain");
    expect(r.reasons.length).toBe(2);
  });

  it("is 'likely' with one mild concern", () => {
    expect(assessLegitimacy({ hasSalary: false, descriptionLength: 1200 }).level).toBe("likely");
  });

  it("is 'likely' for a salaried, substantive posting", () => {
    expect(assessLegitimacy({ hasSalary: true, descriptionLength: 1200 }).level).toBe("likely");
  });
});
