import { alertsRequireProError, freeLimitGuidance, paymentsEnabled } from "./payments";

const KEY = "NEXT_PUBLIC_HUST_PAYMENTS_ENABLED";
const UPGRADE_ADVICE = /upgrade to pro|upgrade to get/i;

function withFlag<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env[KEY];
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[KEY];
    else process.env[KEY] = previous;
  }
}

describe("paymentsEnabled", () => {
  it("is OFF when the variable is unset", () => {
    expect(withFlag(undefined, paymentsEnabled)).toBe(false);
  });

  it.each([["TRUE"], ["1"], ["yes"], [" true"], [""]])("is OFF for %p", (value) => {
    expect(withFlag(value, paymentsEnabled)).toBe(false);
  });

  it('is ON for exactly "true"', () => {
    expect(withFlag("true", paymentsEnabled)).toBe(true);
  });
});

describe("what the assistant is told while payments are OFF", () => {
  it("never advises upgrading, and says when the allowance resets", () => {
    const text = withFlag(undefined, () => freeLimitGuidance("searches", "a day"));
    expect(text).not.toMatch(UPGRADE_ADVICE);
    expect(text).toContain("resets within a day");
    expect(text).toContain("Do not suggest upgrading or paying");
  });

  it("refuses job alerts without advising an upgrade", () => {
    const text = withFlag(undefined, alertsRequireProError);
    expect(text).not.toMatch(UPGRADE_ADVICE);
    expect(text).toContain("Pro subscription");
  });
});

describe("what the assistant is told while payments are ON (the original wording)", () => {
  it("restores the upgrade advice exactly", () => {
    withFlag("true", () => {
      expect(freeLimitGuidance("searches", "a day")).toBe(
        "Let them know they can upgrade to Pro for unlimited searches.",
      );
      expect(alertsRequireProError()).toBe(
        "Job alerts require a Pro subscription. Upgrade to get alerts.",
      );
    });
  });
});
