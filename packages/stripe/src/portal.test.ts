import { createPortalSession } from "./portal";

// ---------------------------------------------------------------------------
// Mock getStripe — returns a fake Stripe client
// ---------------------------------------------------------------------------

const mockCreate = jest.fn();

jest.mock("./index", () => ({
  getStripe: () => ({
    billingPortal: {
      sessions: {
        create: mockCreate,
      },
    },
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPortalSession", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      url: "https://billing.stripe.com/portal_abc",
    });
  });

  it("creates a portal session and returns the URL", async () => {
    const result = await createPortalSession({
      stripeCustomerId: "cus_abc123",
      returnUrl: "https://everjobs.ai/settings",
    });

    expect(result).toEqual({
      url: "https://billing.stripe.com/portal_abc",
    });
  });

  it("passes correct parameters to Stripe", async () => {
    await createPortalSession({
      stripeCustomerId: "cus_abc123",
      returnUrl: "https://everjobs.ai/settings",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      customer: "cus_abc123",
      return_url: "https://everjobs.ai/settings",
    });
  });

  it("passes different customer IDs correctly", async () => {
    await createPortalSession({
      stripeCustomerId: "cus_different_456",
      returnUrl: "https://everjobs.ai/settings",
    });

    const args = mockCreate.mock.calls[0][0];
    expect(args.customer).toBe("cus_different_456");
  });

  it("passes different return URLs correctly", async () => {
    await createPortalSession({
      stripeCustomerId: "cus_abc123",
      returnUrl: "http://localhost:3000/settings",
    });

    const args = mockCreate.mock.calls[0][0];
    expect(args.return_url).toBe("http://localhost:3000/settings");
  });

  it("propagates Stripe API errors", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("No such customer: cus_invalid")
    );

    await expect(
      createPortalSession({
        stripeCustomerId: "cus_invalid",
        returnUrl: "https://everjobs.ai/settings",
      })
    ).rejects.toThrow("No such customer: cus_invalid");
  });

  it("returns the URL even when it is null (caller must handle)", async () => {
    mockCreate.mockResolvedValueOnce({ url: null });

    const result = await createPortalSession({
      stripeCustomerId: "cus_abc123",
      returnUrl: "https://everjobs.ai/settings",
    });

    expect(result).toEqual({ url: null });
  });
});
