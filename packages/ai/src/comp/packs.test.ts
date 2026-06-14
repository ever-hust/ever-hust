import { COMP_PACKS, getCompPack, isKnownMarket } from "./packs";

describe("comp knowledge packs", () => {
  it("every pack has the required semantics", () => {
    for (const pack of Object.values(COMP_PACKS)) {
      expect(pack.currency).toBeTruthy();
      expect(pack.statutoryComponents.length).toBeGreaterThan(0);
      expect(pack.norms.length).toBeGreaterThan(0);
      expect(pack.version).toBe(1);
    }
  });

  it("loads a known market by ISO code", () => {
    expect(getCompPack("DE").currency).toBe("EUR");
    expect(getCompPack("IN").currency).toBe("INR");
  });

  it("maps common country-name aliases", () => {
    expect(getCompPack("USA").market).toBe("US");
    expect(getCompPack("United Kingdom").market).toBe("UK");
    expect(getCompPack("Germany").market).toBe("DE");
  });

  it("falls back to the generic pack for unknown markets", () => {
    expect(getCompPack("Atlantis").market).toBe("GENERIC");
    expect(getCompPack(null).market).toBe("GENERIC");
  });

  it("isKnownMarket reflects coverage", () => {
    expect(isKnownMarket("US")).toBe(true);
    expect(isKnownMarket("Atlantis")).toBe(false);
    expect(isKnownMarket(null)).toBe(false);
  });
});
