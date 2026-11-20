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
  stripeTopUpKey: (id: string) => `stripe-checkout:${id}`,
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
      id: "cs_topup",
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
    mockGrantCredits.mockResolvedValue(true);
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
    expect(mockGrantCredits).toHaveBeenCalledWith("u1", 50, "topup", {
      idempotencyKey: "stripe-checkout:cs_topup",
    });
    expect(mockReleaseEvent).not.toHaveBeenCalled();
  });

  it("releases its own claim and returns 500 when the grant fails", async () => {
    mockClaimEventStatus.mockResolvedValue("claimed");
    mockGrantCredits.mockRejectedValue(new Error("db down"));

    const res = await send();

    expect(res.status).toBe(500);
    // Released by id and this delivery's own claim time, so another delivery's claim stays.
    const claimedAt = mockClaimEventStatus.mock.calls[0][1];
    expect(claimedAt).toBeInstanceOf(Date);
    expect(mockReleaseEvent).toHaveBeenCalledWith("evt_topup", claimedAt);
  });

  it("releases an unverified claim only by its own claim time when the grant fails", async () => {
    // "unverified": the claim insert may have committed although the client saw an error.
    // Releasing by (id, this delivery's claim time) deletes only a claim this delivery wrote,
    // so Stripe's retry is processed and another delivery's claim is never touched.
    mockClaimEventStatus.mockResolvedValue("unverified");
    mockGrantCredits.mockRejectedValue(new Error("db down"));

    const res = await send();

    expect(res.status).toBe(500);
    const claimedAt = mockClaimEventStatus.mock.calls[0][1];
    expect(mockReleaseEvent).toHaveBeenCalledTimes(1);
    expect(mockReleaseEvent).toHaveBeenCalledWith("evt_topup", claimedAt);
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
    mockGrantCredits.mockRejectedValueOnce(new Error("db down")).mockResolvedValue(true);

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

  it("top-up: a grant that committed although its reply was lost is not granted again on the retry", async () => {
    // In-memory credit ledger keyed like credit_tx_grant_unique (user, reason, period_key).
    const ledger = new Map<string, number>();
    let replyLost = true;
    mockGrantCredits.mockImplementation(
      async (userId: string, amount: number, reason: string, opts: { idempotencyKey: string }) => {
        const key = `${userId}|${reason}|${opts.idempotencyKey}`;
        const inserted = !ledger.has(key);
        if (inserted) ledger.set(key, amount);
        if (replyLost) {
          // The INSERT committed, then the connection dropped before the reply.
          replyLost = false;
          throw new Error("Connection terminated unexpectedly");
        }
        return inserted;
      },
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockConstructEvent.mockReturnValue(topUpEvent);

    const first = await send();
    expect(first.status).toBe(500);
    expect(claims.has("evt_topup")).toBe(false);

    const retry = await send();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ received: true, credited: true, deduplicated: true });

    // One credit row for the payment, not two.
    expect([...ledger.values()]).toEqual([50]);
    warnSpy.mockRestore();
  });

  it("top-up: a second event for the same checkout session does not grant again", async () => {
    const ledger = new Set<string>();
    mockGrantCredits.mockImplementation(
      async (_u: string, _a: number, _r: string, opts: { idempotencyKey: string }) => {
        if (ledger.has(opts.idempotencyKey)) return false;
        ledger.add(opts.idempotencyKey);
        return true;
      },
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    mockConstructEvent.mockReturnValue(topUpEvent);
    expect((await send()).status).toBe(200);
    // A different event id (so the claim is new) for the same Checkout Session.
    mockConstructEvent.mockReturnValue({ ...topUpEvent, id: "evt_topup_again" });
    const again = await send();

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ received: true, credited: true, deduplicated: true });
    expect(ledger).toEqual(new Set(["stripe-checkout:cs_topup"]));
    warnSpy.mockRestore();
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
