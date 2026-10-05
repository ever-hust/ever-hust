import { createCreditCheckoutSession, CREDIT_PACKS } from "./credits-checkout";

const mockSessionCreate = jest.fn();
const mockPricesList = jest.fn();
const mockPricesCreate = jest.fn();
const mockProductsSearch = jest.fn();
const mockProductsCreate = jest.fn();

jest.mock("./index", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: mockSessionCreate } },
    prices: { list: mockPricesList, create: mockPricesCreate },
    products: { search: mockProductsSearch, create: mockProductsCreate },
  }),
}));

jest.mock("./plans", () => ({ CLOUD_TRIAL_DAYS: 90, PLANS: [] }));

const base = {
  userId: "user_1",
  email: "user@example.com",
  successUrl: "https://app.hust.so/settings?credits=success",
  cancelUrl: "https://app.hust.so/settings",
};

describe("createCreditCheckoutSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c", id: "cs_1" });
  });

  it("keeps the packs unchanged: $5 / $12 / $30 for 5,000 / 12,000 / 30,000 credits", () => {
    expect(
      Object.fromEntries(Object.entries(CREDIT_PACKS).map(([id, p]) => [id, [p.amountCents, p.credits]])),
    ).toEqual({ small: [500, 5000], medium: [1200, 12000], large: [3000, 30000] });
  });

  it("stamps the Hust marker so the shared-account webhook only credits Hust's own top-ups", async () => {
    mockPricesList.mockResolvedValue({ data: [{ id: "price_existing" }] });
    await createCreditCheckoutSession({ ...base, packId: "small" });
    const args = mockSessionCreate.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.line_items).toEqual([{ price: "price_existing", quantity: 1 }]);
    expect(args.metadata).toEqual({
      userId: "user_1",
      type: "credits",
      packId: "small",
      credits: "5000",
      app: "hust",
    });
  });

  it("searches for the credits product with Stripe's double-quoted syntax", async () => {
    mockPricesList.mockResolvedValue({ data: [] });
    mockProductsSearch.mockResolvedValue({ data: [{ id: "prod_found" }] });
    mockPricesCreate.mockResolvedValue({ id: "price_new" });
    await createCreditCheckoutSession({ ...base, packId: "medium" });
    expect(mockProductsSearch.mock.calls[0][0].query).toBe('metadata["hust_credits"]:"1" AND active:"true"');
    expect(mockProductsCreate).not.toHaveBeenCalled();
    expect(mockPricesCreate.mock.calls[0][0]).toMatchObject({
      product: "prod_found",
      unit_amount: 1200,
      lookup_key: "hust_credits_medium",
    });
  });
});
