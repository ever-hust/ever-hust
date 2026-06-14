/**
 * Localized comp / benefit knowledge packs (spec #19b).
 *
 * Comp is market *semantics*, not just a number (statutory bonuses, severance norms, 13th-month
 * pay, equity conventions). These versioned, per-market packs let evaluation (#3 Comp/Demand),
 * salary insights, and negotiation (#15) reason correctly outside the US. Seeded in code for v1
 * (the spec allows a table OR code seed); a generic pack is the fallback for unknown markets.
 *
 * NOTE: packs are DATA, versioned independently of user data (the two-layer contract, #13).
 */
export interface CompPack {
  market: string; // ISO-3166 alpha-2, or "GENERIC"
  version: number;
  currency: string;
  /** Pay components that are statutory / customary in this market. */
  statutoryComponents: string[];
  /** Norms a candidate should know when reading/negotiating an offer here. */
  norms: string[];
  equityConvention: string;
}

export const COMP_PACKS: Record<string, CompPack> = {
  US: {
    market: "US",
    version: 1,
    currency: "USD",
    statutoryComponents: ["base salary", "bonus (discretionary)", "401k match"],
    norms: [
      "Base + bonus + equity is the standard total-comp framing.",
      "At-will employment; severance is negotiated, not statutory.",
      "Health benefits are a material part of comp.",
    ],
    equityConvention: "RSUs (public) or options with a 4-year vest, 1-year cliff",
  },
  DE: {
    market: "DE",
    version: 1,
    currency: "EUR",
    statutoryComponents: ["base salary", "statutory pension", "health insurance"],
    norms: [
      "Comp is usually quoted as gross annual base; bonuses are smaller than US norms.",
      "Strong statutory notice periods and employment protection.",
      "13th-month / holiday pay appears in some sectors.",
    ],
    equityConvention: "Equity is less common; VSOPs at startups",
  },
  UK: {
    market: "UK",
    version: 1,
    currency: "GBP",
    statutoryComponents: ["base salary", "pension auto-enrolment", "statutory holiday"],
    norms: [
      "Base + bonus; equity common at startups, rarer at large firms.",
      "Statutory redundancy pay applies after 2 years.",
    ],
    equityConvention: "EMI options at startups; RSUs at large tech",
  },
  IN: {
    market: "IN",
    version: 1,
    currency: "INR",
    statutoryComponents: ["base", "HRA", "provident fund", "gratuity"],
    norms: [
      "Comp quoted as CTC (cost-to-company), which bundles many components.",
      "Variable pay and joining bonuses are common; clarify fixed vs variable.",
      "Gratuity is statutory after 5 years.",
    ],
    equityConvention: "ESOPs at startups; RSUs at multinationals",
  },
  GENERIC: {
    market: "GENERIC",
    version: 1,
    currency: "USD",
    statutoryComponents: ["base salary"],
    norms: [
      "Clarify the total-comp framing (base, bonus, equity, benefits) for this market.",
      "Confirm what is statutory vs negotiable locally before anchoring.",
    ],
    equityConvention: "Varies by market — confirm locally",
  },
};

function normalizeMarket(market: string | null | undefined): string {
  if (!market) return "GENERIC";
  const m = market.trim().toUpperCase();
  // Map a few common country names to ISO codes.
  const ALIASES: Record<string, string> = {
    USA: "US",
    "UNITED STATES": "US",
    GERMANY: "DE",
    DEUTSCHLAND: "DE",
    "UNITED KINGDOM": "UK",
    GB: "UK",
    ENGLAND: "UK",
    INDIA: "IN",
  };
  return ALIASES[m] ?? m;
}

export function isKnownMarket(market: string | null | undefined): boolean {
  const m = normalizeMarket(market);
  return m !== "GENERIC" && m in COMP_PACKS;
}

/** Load the comp pack for a market, falling back to the generic pack. */
export function getCompPack(market: string | null | undefined): CompPack {
  return COMP_PACKS[normalizeMarket(market)] ?? COMP_PACKS.GENERIC!;
}
