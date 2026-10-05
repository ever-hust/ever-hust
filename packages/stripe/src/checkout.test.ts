import { createCheckoutSession } from "./checkout";

// ---------------------------------------------------------------------------
// Mock getStripe — returns a fake Stripe client
// ---------------------------------------------------------------------------

const mockCreate = jest.fn();

jest.mock("./index", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: mockCreate,
      },
    },
  }),
}));

// Mock PLANS with valid test stripePriceIds (env vars are not set in test)
jest.mock("./plans", () => ({
  CLOUD_TRIAL_DAYS: 90,
  PLANS: [
    {
      id: "monthly",
      name: "Monthly",
      price: 20,
      interval: "month",
      pricePerMonth: 20,
      stripePriceId: "price_test_monthly",
      features: ["Unlimited AI conversations"],
    },
    {
      id: "annual",
      name: "Annual",
      price: 168,
      interval: "year",
      pricePerMonth: 14,
      stripePriceId: "price_test_annual",
      features: ["Everything in Monthly"],
      popular: true,
    },
  ],
}));

// Re-import mocked PLANS for assertion references
import { PLANS } from "./plans";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createCheckoutSession", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_123",
      id: "cs_test_abc",
    });
  });

  const baseParams = {
    userId: "user_1",
    email: "user@example.com",
    planId: "monthly",
    successUrl: "https://hust.so/settings?success=true",
    cancelUrl: "https://hust.so/settings?canceled=true",
  };

  it("creates a checkout session for a valid plan", async () => {
    const result = await createCheckoutSession(baseParams);

    expect(result).toEqual({
      url: "https://checkout.stripe.com/session_123",
      sessionId: "cs_test_abc",
    });
  });

  it("passes correct parameters to Stripe", async () => {
    await createCheckoutSession(baseParams);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0];

    expect(args.mode).toBe("subscription");
    expect(args.payment_method_types).toEqual(["card"]);
    expect(args.success_url).toBe(baseParams.successUrl);
    expect(args.cancel_url).toBe(baseParams.cancelUrl);
    expect(args.client_reference_id).toBe("user_1");
    expect(args.metadata).toEqual({ userId: "user_1", planId: "monthly", app: "hust" });
    expect(args.subscription_data.metadata).toEqual({
      userId: "user_1",
      planId: "monthly",
      app: "hust",
    });
  });

  it("uses the plan's stripePriceId for line items", async () => {
    await createCheckoutSession(baseParams);

    const args = mockCreate.mock.calls[0][0];
    expect(args.line_items).toEqual([
      { price: "price_test_monthly", quantity: 1 },
    ]);
  });

  it("sets customer_email when no stripeCustomerId is provided", async () => {
    await createCheckoutSession(baseParams);

    const args = mockCreate.mock.calls[0][0];
    expect(args.customer).toBeUndefined();
    expect(args.customer_email).toBe("user@example.com");
  });

  it("sets customer and omits customer_email when stripeCustomerId is provided", async () => {
    await createCheckoutSession({
      ...baseParams,
      stripeCustomerId: "cus_existing_123",
    });

    const args = mockCreate.mock.calls[0][0];
    expect(args.customer).toBe("cus_existing_123");
    expect(args.customer_email).toBeUndefined();
  });

  it("handles null stripeCustomerId the same as undefined", async () => {
    await createCheckoutSession({
      ...baseParams,
      stripeCustomerId: null,
    });

    const args = mockCreate.mock.calls[0][0];
    expect(args.customer).toBeUndefined();
    expect(args.customer_email).toBe("user@example.com");
  });

  it("refuses the quarterly plan: it is gated, not on sale", async () => {
    await expect(
      createCheckoutSession({ ...baseParams, planId: "quarterly" })
    ).rejects.toThrow("Invalid plan: quarterly");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("works for the annual plan", async () => {
    await createCheckoutSession({ ...baseParams, planId: "annual" });

    const args = mockCreate.mock.calls[0][0];
    expect(args.line_items[0].price).toBe("price_test_annual");
    expect(args.metadata.planId).toBe("annual");
  });

  it("throws for an invalid plan ID", async () => {
    await expect(
      createCheckoutSession({ ...baseParams, planId: "enterprise" })
    ).rejects.toThrow("Invalid plan: enterprise");
  });

  it("throws for an empty plan ID", async () => {
    await expect(
      createCheckoutSession({ ...baseParams, planId: "" })
    ).rejects.toThrow("Invalid plan:");
  });

  it("propagates Stripe API errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Stripe API error: rate limited"));

    await expect(createCheckoutSession(baseParams)).rejects.toThrow(
      "Stripe API error: rate limited"
    );
  });

  it("starts Cloud Pro with the 90-day free trial and takes the card up front", async () => {
    await createCheckoutSession({ ...baseParams, planId: "annual" });

    const args = mockCreate.mock.calls[0][0];
    expect(args.payment_method_collection).toBe("always");
    expect(args.subscription_data).toEqual({
      trial_period_days: 90,
      metadata: { userId: "user_1", planId: "annual", app: "hust" },
    });
  });

  it("leaves Stripe Tax off unless STRIPE_AUTOMATIC_TAX=true", async () => {
    delete process.env.STRIPE_AUTOMATIC_TAX;
    await createCheckoutSession({ ...baseParams, stripeCustomerId: "cus_1" });
    const off = mockCreate.mock.calls[0][0];
    expect(off.automatic_tax).toBeUndefined();
    expect(off.customer_update).toBeUndefined();

    process.env.STRIPE_AUTOMATIC_TAX = "true";
    try {
      await createCheckoutSession({ ...baseParams, stripeCustomerId: "cus_1" });
      await createCheckoutSession(baseParams);
    } finally {
      delete process.env.STRIPE_AUTOMATIC_TAX;
    }
    const withCustomer = mockCreate.mock.calls[1][0];
    expect(withCustomer.automatic_tax).toEqual({ enabled: true });
    expect(withCustomer.customer_update).toEqual({ address: "auto", name: "auto" });
    // customer_update needs a customer object; an email-only session omits it.
    const emailOnly = mockCreate.mock.calls[2][0];
    expect(emailOnly.automatic_tax).toEqual({ enabled: true });
    expect(emailOnly.customer_update).toBeUndefined();
  });
});
