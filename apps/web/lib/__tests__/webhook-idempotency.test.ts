/**
 * Tests for the real Stripe webhook idempotency helpers
 * (apps/web/lib/stripe-webhook-idempotency.ts) with the database mocked.
 */

const mockValues = jest.fn();
const mockInsert = jest.fn(() => ({ values: mockValues }));
const mockWhere = jest.fn();
const mockDelete = jest.fn(() => ({ where: mockWhere }));

jest.mock("@ever-hust/db", () => ({
  db: {
    insert: (...args: unknown[]) => (mockInsert as (...a: unknown[]) => unknown)(...args),
    delete: (...args: unknown[]) => (mockDelete as (...a: unknown[]) => unknown)(...args),
  },
  stripeWebhookEvents: { id: "stripe_webhook_events.id" },
}));

jest.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
}));

import { claimEvent, claimEventStatus, releaseEvent } from "../stripe-webhook-idempotency";

/** Error with a Postgres-style `code` property (raw driver error shape). */
function pgError(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

/** Drizzle 0.45 shape: wrapper without `code`, driver error on `.cause`. */
function drizzleError(code: string): Error {
  return new Error("Failed query: insert into ...", { cause: pgError("driver error", code) });
}

describe("claimEvent (webhook idempotency)", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns true when the insert succeeds (first claim)", async () => {
    mockValues.mockResolvedValue(undefined);

    expect(await claimEvent("evt_first")).toBe(true);
    expect(mockValues).toHaveBeenCalledWith({ id: "evt_first" });
  });

  it("returns false for a Drizzle-wrapped unique violation (code on cause)", async () => {
    mockValues.mockRejectedValue(drizzleError("23505"));

    expect(await claimEvent("evt_dup")).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns false for a plain error with code 23505", async () => {
    mockValues.mockRejectedValue(pgError("duplicate key value", "23505"));

    expect(await claimEvent("evt_dup")).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns true and warns for another database error", async () => {
    mockValues.mockRejectedValue(pgError("connection refused", "08006"));

    expect(await claimEvent("evt_db_down")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Idempotency check failed"),
      "connection refused",
    );
  });

  it("returns true for a Drizzle-wrapped error with a different code", async () => {
    mockValues.mockRejectedValue(drizzleError("23503"));

    expect(await claimEvent("evt_fk")).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns true for a generic Error without a code or cause", async () => {
    mockValues.mockRejectedValue(new Error("something unexpected"));

    expect(await claimEvent("evt_generic")).toBe(true);
  });

  it("returns true when the thrown value is not an Error", async () => {
    mockValues.mockRejectedValue("raw string error");

    expect(await claimEvent("evt_raw")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Idempotency check failed"),
      "raw string error",
    );
  });

  it("does not treat a similar code as a duplicate", async () => {
    mockValues.mockRejectedValue(pgError("near miss", "23506"));

    expect(await claimEvent("evt_near_miss")).toBe(true);
  });
});

describe("claimEventStatus (claim ownership)", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('is "claimed" only when this call inserted the row', async () => {
    mockValues.mockResolvedValue(undefined);
    expect(await claimEventStatus("evt_a")).toBe("claimed");
  });

  it('is "duplicate" for a unique violation, wrapped or not', async () => {
    mockValues.mockRejectedValueOnce(drizzleError("23505"));
    expect(await claimEventStatus("evt_a")).toBe("duplicate");
    mockValues.mockRejectedValueOnce(pgError("dup", "23505"));
    expect(await claimEventStatus("evt_a")).toBe("duplicate");
  });

  it('is "unverified" (no row of ours) when the insert fails for another reason', async () => {
    mockValues.mockRejectedValue(pgError("timeout", "57014"));
    expect(await claimEventStatus("evt_a")).toBe("unverified");
  });
});

describe("releaseEvent", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("deletes the claim row by event id", async () => {
    mockWhere.mockResolvedValue(undefined);

    await releaseEvent("evt_retry");

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledWith({
      op: "eq",
      column: "stripe_webhook_events.id",
      value: "evt_retry",
    });
  });

  it("never throws when the delete fails, and logs it", async () => {
    mockWhere.mockRejectedValue(new Error("db down"));

    await expect(releaseEvent("evt_retry")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to release"),
      "evt_retry",
      "db down",
    );
  });
});
