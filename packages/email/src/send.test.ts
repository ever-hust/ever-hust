/**
 * Tests for the email sending module.
 *
 * These tests focus on the retry logic and error handling.
 * The actual Resend API and React Email rendering are mocked.
 */

// Mock the email index module (Resend client, EMAIL_FROM, getAppUrl)
const mockSendFn = jest.fn();
jest.mock("./index", () => ({
  getResend: () => ({
    emails: {
      send: mockSendFn,
    },
  }),
  EMAIL_FROM: "test@everjobs.ai",
  getAppUrl: () => "https://test.everjobs.ai",
}));

// Mock @react-email/components render
jest.mock("@react-email/components", () => ({
  render: jest.fn().mockResolvedValue("<html>mock</html>"),
}));

// Mock email templates
jest.mock("./templates/job-alert", () => ({
  JobAlertEmail: jest.fn(() => "mock-job-alert-element"),
}));
jest.mock("./templates/welcome", () => ({
  WelcomeEmail: jest.fn(() => "mock-welcome-element"),
}));
jest.mock("./templates/subscription-confirmed", () => ({
  SubscriptionConfirmedEmail: jest.fn(() => "mock-subscription-element"),
}));

import {
  sendJobAlertEmail,
  sendWelcomeEmail,
  sendSubscriptionConfirmedEmail,
} from "./send";

const mockSend = mockSendFn as jest.Mock;

// Speed up tests by removing real delays
jest.useFakeTimers();

beforeEach(() => {
  jest.clearAllMocks();
});

describe("sendJobAlertEmail", () => {
  const params = {
    to: "user@example.com",
    userName: "Jane",
    alertCriteria: "React developer in NYC",
    jobs: [
      {
        title: "Senior React Developer",
        companyName: "TechCorp",
        location: "New York, NY",
        isRemote: false,
        salary: "$120k-$160k",
        jobUrl: "https://example.com/job/1",
      },
    ],
  };

  it("should send successfully on first attempt", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });

    const promise = sendJobAlertEmail(params);
    // Flush all pending timers for retry delays
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: "email_123" });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "test@everjobs.ai",
        to: "user@example.com",
        subject: '1 new job matching "React developer in NYC"',
      }),
    );
  });

  it("should pluralize subject when multiple jobs", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "email_456" }, error: null });

    const promise = sendJobAlertEmail({
      ...params,
      jobs: [
        ...params.jobs,
        {
          title: "React Engineer",
          companyName: "StartupX",
          jobUrl: "https://example.com/job/2",
        },
      ],
    });
    await jest.runAllTimersAsync();
    await promise;

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '2 new jobs matching "React developer in NYC"',
      }),
    );
  });

  it("should retry on API error and succeed", async () => {
    mockSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: "rate limited", statusCode: 429 },
      })
      .mockResolvedValueOnce({ data: { id: "email_789" }, error: null });

    const promise = sendJobAlertEmail(params);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: "email_789" });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("should retry on thrown error and succeed", async () => {
    mockSend
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ data: { id: "email_ok" }, error: null });

    const promise = sendJobAlertEmail(params);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: "email_ok" });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("should throw after 3 failed attempts with retryable errors", async () => {
    mockSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: "503 service unavailable", statusCode: 503 },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "503 service unavailable", statusCode: 503 },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "503 service unavailable", statusCode: 503 },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "503 service unavailable", statusCode: 503 },
      });

    // Start the send — it will retry with setTimeout-based backoff.
    // Attach the rejection expectation first, then advance fake timers
    // so the promise settles without an unhandled rejection warning.
    const assertion = expect(sendJobAlertEmail(params)).rejects.toThrow(
      "Failed to send job alert email",
    );
    await jest.runAllTimersAsync();
    await assertion;
    expect(mockSend).toHaveBeenCalled();
  });

  it("should use default manageUrl and unsubscribeUrl", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "email_1" }, error: null });

    const promise = sendJobAlertEmail(params);
    await jest.runAllTimersAsync();
    await promise;

    // The template should receive URLs derived from getAppUrl()
    const { JobAlertEmail } = require("./templates/job-alert");
    expect(JobAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        manageUrl: "https://test.everjobs.ai/settings",
        unsubscribeUrl: "https://test.everjobs.ai/settings",
      }),
    );
  });
});

describe("sendWelcomeEmail", () => {
  const params = {
    to: "newuser@example.com",
    userName: "Alice",
  };

  it("should send welcome email successfully", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "welcome_1" }, error: null });

    const promise = sendWelcomeEmail(params);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: "welcome_1" });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "newuser@example.com",
        subject: expect.stringContaining("Welcome to Ever Jobs"),
      }),
    );
  });

  it("should use default chatUrl from getAppUrl()", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "w_2" }, error: null });

    const promise = sendWelcomeEmail(params);
    await jest.runAllTimersAsync();
    await promise;

    const { WelcomeEmail } = require("./templates/welcome");
    expect(WelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        chatUrl: "https://test.everjobs.ai/chat",
      }),
    );
  });

  it("should use custom chatUrl when provided", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "w_3" }, error: null });

    const promise = sendWelcomeEmail({
      ...params,
      chatUrl: "https://custom.example.com/chat",
    });
    await jest.runAllTimersAsync();
    await promise;

    const { WelcomeEmail } = require("./templates/welcome");
    expect(WelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        chatUrl: "https://custom.example.com/chat",
      }),
    );
  });
});

describe("sendSubscriptionConfirmedEmail", () => {
  const params = {
    to: "subscriber@example.com",
    userName: "Bob",
    planName: "Quarterly",
    amount: "$29.99",
    billingCycle: "quarterly",
  };

  it("should send subscription confirmed email", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "sub_1" }, error: null });

    const promise = sendSubscriptionConfirmedEmail(params);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: "sub_1" });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "subscriber@example.com",
        subject: "Your Ever Jobs Pro subscription is active — Quarterly plan",
      }),
    );
  });

  it("should use default chatUrl and manageUrl from getAppUrl()", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "sub_2" }, error: null });

    const promise = sendSubscriptionConfirmedEmail(params);
    await jest.runAllTimersAsync();
    await promise;

    const { SubscriptionConfirmedEmail } = require("./templates/subscription-confirmed");
    expect(SubscriptionConfirmedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        chatUrl: "https://test.everjobs.ai/chat",
        manageUrl: "https://test.everjobs.ai/settings",
      }),
    );
  });
});

describe("retry logic", () => {
  it("should handle non-Error thrown values", async () => {
    mockSend
      .mockRejectedValueOnce("network error")
      .mockResolvedValueOnce({ data: { id: "ok" }, error: null });

    const promise = sendWelcomeEmail({
      to: "test@test.com",
      userName: "Test",
    });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: "ok" });
  });

  it("should throw last error after all retries fail with retryable errors", async () => {
    mockSend
      .mockRejectedValueOnce(new Error("timeout 1"))
      .mockRejectedValueOnce(new Error("timeout 2"))
      .mockRejectedValueOnce(new Error("timeout 3"))
      .mockRejectedValueOnce(new Error("timeout 4"));

    const assertion = expect(
      sendWelcomeEmail({
        to: "test@test.com",
        userName: "Test",
      }),
    ).rejects.toThrow("timeout");
    await jest.runAllTimersAsync();
    await assertion;
  });

  it("should not retry non-retryable errors", async () => {
    mockSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: "validation error: invalid email", statusCode: 422 },
      });

    const assertion = expect(
      sendWelcomeEmail({
        to: "test@test.com",
        userName: "Test",
      }),
    ).rejects.toThrow("Failed to send welcome email");
    await jest.runAllTimersAsync();
    await assertion;
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
