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
const mockDbUpdate = jest.fn();
const mockParseWebhookEvent = jest.fn();

jest.mock("@ever-hust/db", () => ({
  db: { update: (...a: unknown[]) => mockDbUpdate(...a) },
  users: {},
  subscriptions: {},
}));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), ne: jest.fn() }));
jest.mock("@ever-hust/email", () => ({ sendSubscriptionConfirmedEmail: jest.fn() }));
jest.mock("@ever-hust/ai", () => ({
  grantCredits: (...a: unknown[]) => mockGrantCredits(...a),
}));
jest.mock("@ever-hust/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) } }),
  parseWebhookEvent: (...a: unknown[]) => mockParseWebhookEvent(...a),
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
    mockParseWebhookEvent.mockReturnValue(null);
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

describe("POST /api/stripe/webhook retry recovery", () => {
  let errorSpy: jest.SpyInstance;
  let claims: Set<string>;
  let released: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    // In-memory stand-in for the claim table, so a following delivery sees
    // exactly what the previous one left behind.
    claims = new Set();
    released = false;
    mockClaimEventStatus.mockImplementation(async (id: string) => {
      if (claims.has(id)) return "duplicate";
      claims.add(id);
      return "claimed";
    });
    // The release is slow, so a route that does not await it before answering
    // would respond while `released` is still false.
    mockReleaseEvent.mockImplementation(async (id: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      claims.delete(id);
      released = true;
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    env.STRIPE_WEBHOOK_SECRET = savedSecret;
  });

  it("top-up: a failed grant is released before the 500, the retry grants, the next one is skipped", async () => {
    mockConstructEvent.mockReturnValue(topUpEvent);
    mockGrantCredits.mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined);

    const first = await send();
    expect(first.status).toBe(500);
    expect(released).toBe(true);
    expect(claims.has("evt_topup")).toBe(false);

    const retry = await send();
    expect(retry.status).toBe(200);
    expect(mockGrantCredits).toHaveBeenCalledTimes(2);
    expect(claims.has("evt_topup")).toBe(true);

    const redelivery = await send();
    expect(await redelivery.json()).toEqual({ received: true, deduplicated: true });
    expect(mockGrantCredits).toHaveBeenCalledTimes(2);
  });

  it("subscription events: a failed handler is released before the 500 and the retry runs", async () => {
    mockConstructEvent.mockReturnValue({ id: "evt_inv", type: "invoice.paid", data: { object: {} } });
    mockParseWebhookEvent.mockReturnValue({ type: "invoice.paid", data: { stripeCustomerId: "cus_1" } });
    const where = jest.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined);
    mockDbUpdate.mockReturnValue({ set: () => ({ where }) });

    const first = await send();
    expect(first.status).toBe(500);
    expect(released).toBe(true);
    expect(claims.has("evt_inv")).toBe(false);

    const retry = await send();
    expect(retry.status).toBe(200);
    expect(where).toHaveBeenCalledTimes(2);
    expect(claims.has("evt_inv")).toBe(true);

    const redelivery = await send();
    expect(await redelivery.json()).toEqual({ received: true, deduplicated: true });
    expect(where).toHaveBeenCalledTimes(2);
  });
});
