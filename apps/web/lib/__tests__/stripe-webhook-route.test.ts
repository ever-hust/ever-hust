/**
 * Stripe webhook route: duplicate deliveries are skipped, and a failed
 * delivery releases only a claim it owns so Stripe's retry is processed.
 */
const mockClaimEventStatus = jest.fn();
const mockReleaseEvent = jest.fn();
const mockGrantCredits = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock("../stripe-webhook-idempotency", () => ({
  claimEventStatus: (...a: unknown[]) => mockClaimEventStatus(...a),
  releaseEvent: (...a: unknown[]) => mockReleaseEvent(...a),
}));
jest.mock("@ever-hust/db", () => ({ db: {}, users: {}, subscriptions: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), ne: jest.fn() }));
jest.mock("@ever-hust/email", () => ({ sendSubscriptionConfirmedEmail: jest.fn() }));
jest.mock("@ever-hust/ai", () => ({
  grantCredits: (...a: unknown[]) => mockGrantCredits(...a),
}));
jest.mock("@ever-hust/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) } }),
  parseWebhookEvent: jest.fn(() => null),
}));

import { POST } from "../../app/api/stripe/webhook/route";

const env = process.env as Record<string, string | undefined>;
const savedSecret = env.STRIPE_WEBHOOK_SECRET;

const topUpEvent = {
  id: "evt_topup",
  type: "checkout.session.completed",
  data: {
    object: {
      payment_status: "paid",
      metadata: { type: "credits", app: "hust", userId: "u1", credits: "50" },
    },
  },
};

function send() {
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
}

describe("POST /api/stripe/webhook idempotency", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockConstructEvent.mockReturnValue(topUpEvent);
    mockGrantCredits.mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    env.STRIPE_WEBHOOK_SECRET = savedSecret;
  });

  it("skips a duplicate delivery without granting credits", async () => {
    mockClaimEventStatus.mockResolvedValue("duplicate");

    const res = await send();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, deduplicated: true });
    expect(mockGrantCredits).not.toHaveBeenCalled();
    expect(mockReleaseEvent).not.toHaveBeenCalled();
  });

  it("grants once and keeps the claim on success", async () => {
    mockClaimEventStatus.mockResolvedValue("claimed");

    const res = await send();

    expect(res.status).toBe(200);
    expect(mockGrantCredits).toHaveBeenCalledWith("u1", 50, "topup");
    expect(mockReleaseEvent).not.toHaveBeenCalled();
  });

  it("releases its own claim and returns 500 when the grant fails", async () => {
    mockClaimEventStatus.mockResolvedValue("claimed");
    mockGrantCredits.mockRejectedValue(new Error("db down"));

    const res = await send();

    expect(res.status).toBe(500);
    expect(mockReleaseEvent).toHaveBeenCalledWith("evt_topup");
  });

  it("does not release a claim it does not own when the grant fails", async () => {
    mockClaimEventStatus.mockResolvedValue("unverified");
    mockGrantCredits.mockRejectedValue(new Error("db down"));

    const res = await send();

    expect(res.status).toBe(500);
    expect(mockReleaseEvent).not.toHaveBeenCalled();
  });
});
