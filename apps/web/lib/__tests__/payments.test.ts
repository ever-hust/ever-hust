import { classifyChatError, ChatRequestError } from "../chat-error";
import {
  PAYMENTS_ENABLED,
  PRO_COMING_SOON,
  alertsRequireProMessage,
  messageLimitMessage,
  modelRequiresProMessage,
  outOfCreditsMessage,
  proFeatureDescription,
} from "../payments";

const UPGRADE = /upgrade|top up/i;

describe("the payments flag", () => {
  it("is OFF when the build does not set NEXT_PUBLIC_HUST_PAYMENTS_ENABLED", () => {
    // The test run does not set the variable: this is what a build without it bakes.
    expect(process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED).toBeUndefined();
    expect(PAYMENTS_ENABLED).toBe(false);
  });

  it.each([["TRUE"], ["1"], ["yes"], [" true"], [""]])(
    "stays OFF for %p - only the exact string \"true\" turns it on",
    (value) => {
      jest.isolateModules(() => {
        const previous = process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED;
        process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED = value;
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          expect(require("../payments").PAYMENTS_ENABLED).toBe(false);
        } finally {
          if (previous === undefined) delete process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED;
          else process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED = previous;
        }
      });
    },
  );

  it('is ON for exactly "true"', () => {
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED = "true";
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        expect(require("../payments").PAYMENTS_ENABLED).toBe(true);
      } finally {
        delete process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED;
      }
    });
  });
});

describe("copy while payments are OFF", () => {
  const messages = [
    ["messageLimitMessage", messageLimitMessage(false)],
    ["outOfCreditsMessage", outOfCreditsMessage(false)],
    ["alertsRequireProMessage", alertsRequireProMessage(false)],
    ["modelRequiresProMessage", modelRequiresProMessage(false)],
    ["proFeatureDescription", proFeatureDescription("Job alerts", false)],
  ] as const;

  it.each(messages)("%s never offers an upgrade or a top-up", (_name, text) => {
    expect(text).not.toMatch(UPGRADE);
  });

  it("says Pro is coming soon wherever it names Pro", () => {
    expect(alertsRequireProMessage(false)).toContain(PRO_COMING_SOON);
    expect(modelRequiresProMessage(false)).toContain(PRO_COMING_SOON);
    expect(proFeatureDescription("Job alerts", false)).toBe(
      `Job alerts is a Pro feature. ${PRO_COMING_SOON}`,
    );
  });

  it("uses the module default (OFF in this run) when no argument is passed", () => {
    expect(messageLimitMessage()).toBe(messageLimitMessage(false));
    expect(outOfCreditsMessage()).toBe(outOfCreditsMessage(false));
  });
});

describe("copy while payments are ON is the original wording", () => {
  it("restores every upgrade message exactly", () => {
    expect(messageLimitMessage(true)).toBe(
      "Daily message limit reached. Upgrade to Pro for unlimited messages.",
    );
    expect(outOfCreditsMessage(true)).toBe(
      "You're out of credits. Upgrade to Pro or top up to keep using Hust AI.",
    );
    expect(alertsRequireProMessage(true)).toBe("Upgrade to Pro to create job alerts.");
    expect(modelRequiresProMessage(true)).toBe("Upgrade to Pro to use this model");
    expect(proFeatureDescription("Job alerts", true)).toBe(
      "Job alerts is a Pro feature. Upgrade to unlock unlimited access.",
    );
  });
});

describe("the chat banner still recognises the daily cap with the payments-off wording", () => {
  it("classifies it by limitType, not by the word 'upgrade'", () => {
    const text = messageLimitMessage(false);
    const err = new ChatRequestError(text, { status: 429, limitType: "messages" });
    const info = classifyChatError(err);
    expect(info.kind).toBe("upgrade-limit");
    expect(info.description).toBe(text);
    expect(info.canRetry).toBe(false);
  });

  it("also by the text fallback, so a response without limitType is still the daily cap", () => {
    const err = new ChatRequestError(messageLimitMessage(false), { status: 429 });
    expect(classifyChatError(err).kind).toBe("upgrade-limit");
  });

  it("control: an unrelated 429 is a rate limit, not the daily cap", () => {
    const err = new ChatRequestError("Too many requests, slow down", { status: 429 });
    expect(classifyChatError(err).kind).not.toBe("upgrade-limit");
  });
});
