/**
 * grantCredits with an idempotency key writes the key into period_key, which the
 * credit_tx_grant_unique index (user_id, reason, period_key) covers, and skips a repeat with
 * ON CONFLICT DO NOTHING. The Stripe webhook keys a top-up by its Checkout Session, so a retry
 * after a grant that committed can't add the credits twice.
 */
type Row = Record<string, unknown>;

const mockLedger: Row[] = [];
const mockCalls: string[] = [];

/** Insert into the ledger, enforcing (userId, reason, periodKey) like the unique index. */
function mockInsert(values: Row, onConflictDoNothing: boolean): Row[] {
  const clash =
    values.periodKey != null &&
    mockLedger.some(
      (r) =>
        r.userId === values.userId &&
        r.reason === values.reason &&
        r.periodKey === values.periodKey,
    );
  if (clash) {
    if (onConflictDoNothing) return [];
    throw new Error('duplicate key value violates unique constraint "credit_tx_grant_unique"');
  }
  const row = { id: mockLedger.length + 1, ...values };
  mockLedger.push(row);
  return [row];
}

jest.mock("@ever-hust/db", () => ({
  creditTransactions: { id: "id" },
  db: {
    insert: () => ({
      values: (values: Row) => {
        let conflictSkip = false;
        const builder = {
          onConflictDoNothing: () => {
            mockCalls.push("onConflictDoNothing");
            conflictSkip = true;
            return builder;
          },
          returning: async () => mockInsert(values, conflictSkip),
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            try {
              mockInsert(values, conflictSkip);
              return Promise.resolve(undefined).then(resolve);
            } catch (error) {
              return Promise.reject(error).catch(reject);
            }
          },
        };
        return builder;
      },
    }),
  },
}));
jest.mock("@ever-hust/plugin", () => ({ findModelByKey: () => undefined }));
jest.mock("drizzle-orm", () => ({
  and: jest.fn(),
  desc: jest.fn(),
  eq: jest.fn(),
  sql: jest.fn(),
}));

import { grantCredits, stripeTopUpKey } from "./credits";

beforeEach(() => {
  mockLedger.length = 0;
  mockCalls.length = 0;
});

describe("grantCredits idempotency", () => {
  it("grants a keyed top-up once, however often it is retried", async () => {
    const key = stripeTopUpKey("cs_test_1");

    await expect(grantCredits("u1", 5000, "topup", { idempotencyKey: key })).resolves.toBe(true);
    await expect(grantCredits("u1", 5000, "topup", { idempotencyKey: key })).resolves.toBe(false);

    expect(mockLedger).toEqual([
      { id: 1, userId: "u1", delta: 5000, reason: "topup", periodKey: "stripe-checkout:cs_test_1" },
    ]);
    expect(mockCalls).toEqual(["onConflictDoNothing", "onConflictDoNothing"]);
  });

  it("grants separate checkout sessions separately", async () => {
    await grantCredits("u1", 5000, "topup", { idempotencyKey: stripeTopUpKey("cs_a") });
    await grantCredits("u1", 12000, "topup", { idempotencyKey: stripeTopUpKey("cs_b") });

    expect(mockLedger.map((r) => r.delta)).toEqual([5000, 12000]);
  });

  it("keeps unkeyed grants (adjustments) unconstrained", async () => {
    await expect(grantCredits("u1", 100, "adjustment")).resolves.toBe(true);
    await expect(grantCredits("u1", 100, "adjustment")).resolves.toBe(true);

    expect(mockLedger.map((r) => r.periodKey)).toEqual([undefined, undefined]);
    expect(mockCalls).toEqual([]);
  });

  it("writes nothing for a zero or negative amount", async () => {
    await expect(grantCredits("u1", 0, "topup", { idempotencyKey: "k" })).resolves.toBe(false);
    expect(mockLedger).toEqual([]);
  });

  it("keys a top-up by its Checkout Session id", () => {
    expect(stripeTopUpKey("cs_live_abc")).toBe("stripe-checkout:cs_live_abc");
  });
});
