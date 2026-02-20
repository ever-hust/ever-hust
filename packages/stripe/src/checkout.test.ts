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
      id: "quarterly",
      name: "Quarterly",
      price: 36,
      interval: "quarter",
      pricePerMonth: 12,
      stripePriceId: "price_test_quarterly",
      features: ["Everything in Monthly"],
      popular: true,
    },
    {
      id: "annual",
      name: "Annual",
      price: 84,
      interval: "year",
      pricePerMonth: 7,
      stripePriceId: "price_test_annual",
      features: ["Everything in Quarterly"],
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
    successUrl: "https://everjobs.ai/settings?success=true",
    cancelUrl: "https://everjobs.ai/settings?canceled=true",
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
    expect(args.metadata).toEqual({ userId: "user_1", planId: "monthly" });
    expect(args.subscription_data.metadata).toEqual({
      userId: "user_1",
      planId: "monthly",
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

  it("works for the quarterly plan", async () => {
    await createCheckoutSession({ ...baseParams, planId: "quarterly" });

    const args = mockCreate.mock.calls[0][0];
    expect(args.line_items[0].price).toBe("price_test_quarterly");
    expect(args.metadata.planId).toBe("quarterly");
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

  it("includes subscription_data with metadata", async () => {
    await createCheckoutSession({ ...baseParams, planId: "quarterly" });

    const args = mockCreate.mock.calls[0][0];
    expect(args.subscription_data).toEqual({
      metadata: { userId: "user_1", planId: "quarterly" },
    });
  });
});
