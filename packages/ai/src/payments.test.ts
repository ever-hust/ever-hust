import {
  alertsRequireProError,
  freeLimitGuidance,
  paymentsEnabled,
  PAYMENTS_OFF_PROMPT_NOTE,
  proOnlyToolError,
  withPaymentsNote,
} from "./payments";

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

describe("the Pro-only tools and the system prompt while payments are OFF", () => {
  const REFUSALS = [
    "Job applications require a Pro subscription.",
    "Interview prep requires a Pro subscription.",
    "Submitting application answers requires a Pro subscription.",
  ];

  it.each(REFUSALS)("%p tells the model not to suggest upgrading", (onSale) => {
    const text = withFlag(undefined, () => proOnlyToolError(onSale));
    expect(text).not.toMatch(UPGRADE_ADVICE);
    expect(text).toContain("Pro plans are not on sale yet");
    expect(text).toContain("Do not suggest upgrading or paying.");
    // The refusal itself is kept: the feature is still Pro-only.
    expect(text.startsWith(onSale.replace(/\.$/, ""))).toBe(true);
  });

  it("appends the no-upgrade note to the orchestrator prompt", () => {
    const prompt = "5. Only Pro subscribers can use the application agent.";
    const text = withFlag(undefined, () => withPaymentsNote(prompt));
    expect(text.startsWith(prompt)).toBe(true);
    expect(text.endsWith(PAYMENTS_OFF_PROMPT_NOTE)).toBe(true);
    expect(PAYMENTS_OFF_PROMPT_NOTE).toContain("Never suggest upgrading");
  });
});

describe("what the assistant is told while payments are ON (the original wording)", () => {
  it("returns the Pro-only refusals and the prompt unchanged", () => {
    withFlag("true", () => {
      expect(proOnlyToolError("Interview prep requires a Pro subscription.")).toBe(
        "Interview prep requires a Pro subscription.",
      );
      expect(withPaymentsNote("prompt")).toBe("prompt");
    });
  });

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
