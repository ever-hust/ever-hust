/**
 * Unit tests for referral-utils — generateReferralCode.
 */
import { generateReferralCode } from "../referral-utils";

describe("generateReferralCode", () => {
  it("generates a 6-character code", () => {
    const code = generateReferralCode();
    expect(code).toHaveLength(6);
  });

  it("only contains uppercase alphanumeric characters", () => {
    const code = generateReferralCode();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("returns a string", () => {
    const code = generateReferralCode();
    expect(typeof code).toBe("string");
  });

  it("generates unique codes across 100 invocations", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateReferralCode());
    }
    // With 36^6 = ~2.18 billion possible codes, 100 codes should all be unique.
    // A collision here would indicate a broken RNG.
    expect(codes.size).toBe(100);
  });

  it("does not contain lowercase letters", () => {
    // Run several times to increase confidence
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(code).toBe(code.toUpperCase());
    }
  });

  it("does not contain special characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(code).not.toMatch(/[^A-Z0-9]/);
    }
  });

  it("consistently generates 6-character codes across many invocations", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateReferralCode()).toHaveLength(6);
    }
  });
});
