import { reconcile, reconcileWeights } from "./reconcile";

describe("reconcile (two-layer, user wins)", () => {
  it("lets the user layer override the system layer", () => {
    const result = reconcile({ a: 1, b: 2 }, { b: 9 });
    expect(result).toEqual({ a: 1, b: 9 });
  });

  it("never mutates either input (system layer immutable)", () => {
    const system = { a: 1, b: 2 };
    const user = { b: 9 };
    reconcile(system, user);
    expect(system).toEqual({ a: 1, b: 2 });
    expect(user).toEqual({ b: 9 });
  });

  it("reconcileWeights merges dimension weights, user winning", () => {
    const merged = reconcileWeights({ comp: 10, remote: 5 }, { comp: 25 });
    expect(merged).toEqual({ comp: 25, remote: 5 });
  });
});
