/**
 * Unit tests for the webhook idempotency (claimEvent) logic.
 *
 * The real `claimEvent` is a private function inside the Stripe webhook route
 * and is not exported.  We recreate the same logic here as a standalone helper
 * so we can verify the three key behaviors without touching the database:
 *
 *   1. Normal insert succeeds      → returns true  (process the event)
 *   2. Unique constraint violation  → returns false (skip, already processed)
 *   3. Other DB error               → returns true  (safe to retry)
 */

// ── Standalone implementation mirroring the route's claimEvent logic ──────

type InsertFn = (eventId: string) => Promise<void>;

/**
 * Idempotency claim function that mirrors the pattern used in
 * `apps/web/app/api/stripe/webhook/route.ts`.
 *
 * @param eventId  The Stripe event ID.
 * @param insertFn Injected DB insert — throws on conflict or failure.
 */
async function claimEvent(
  eventId: string,
  insertFn: InsertFn,
): Promise<boolean> {
  try {
    await insertFn(eventId);
    return true; // Insert succeeded — first time seeing this event
  } catch (error) {
    // Unique constraint violation means another instance already processed it.
    // PostgreSQL error code 23505 = unique_violation.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return false;
    }
    // For any other DB error, log and allow processing to proceed.
    // It's safer to risk double-processing (handlers are idempotent)
    // than to silently drop a webhook.
    console.warn(
      "[stripe/webhook] Idempotency check failed, proceeding with processing:",
      error instanceof Error ? error.message : error,
    );
    return true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Create an Error with a Postgres-style `code` property. */
function pgError(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("claimEvent (webhook idempotency)", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Suppress console.warn output during tests
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ── Normal insert succeeds ────────────────────────────────────────────

  it("returns true when the insert succeeds (first claim)", async () => {
    const insertFn: InsertFn = jest.fn().mockResolvedValue(undefined);

    const result = await claimEvent("evt_first_time", insertFn);

    expect(result).toBe(true);
    expect(insertFn).toHaveBeenCalledWith("evt_first_time");
  });

  it("calls insertFn exactly once per invocation", async () => {
    const insertFn: InsertFn = jest.fn().mockResolvedValue(undefined);

    await claimEvent("evt_abc", insertFn);
    await claimEvent("evt_def", insertFn);

    expect(insertFn).toHaveBeenCalledTimes(2);
    expect(insertFn).toHaveBeenNthCalledWith(1, "evt_abc");
    expect(insertFn).toHaveBeenNthCalledWith(2, "evt_def");
  });

  // ── Unique constraint violation (23505) ───────────────────────────────

  it("returns false when a unique constraint violation occurs (duplicate event)", async () => {
    const insertFn: InsertFn = jest
      .fn()
      .mockRejectedValue(pgError("duplicate key value", "23505"));

    const result = await claimEvent("evt_duplicate", insertFn);

    expect(result).toBe(false);
  });

  it("does not log a warning for unique constraint violations", async () => {
    const insertFn: InsertFn = jest
      .fn()
      .mockRejectedValue(pgError("duplicate key value", "23505"));

    await claimEvent("evt_duplicate", insertFn);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  // ── Other DB errors → returns true (safe to retry) ────────────────────

  it("returns true when an unknown DB error occurs (safe to retry)", async () => {
    const insertFn: InsertFn = jest
      .fn()
      .mockRejectedValue(pgError("connection refused", "08006"));

    const result = await claimEvent("evt_db_down", insertFn);

    expect(result).toBe(true);
  });

  it("logs a warning for non-constraint DB errors", async () => {
    const insertFn: InsertFn = jest
      .fn()
      .mockRejectedValue(pgError("timeout expired", "57014"));

    await claimEvent("evt_timeout", insertFn);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Idempotency check failed"),
      "timeout expired",
    );
  });

  it("returns true when the error is a generic Error without a code", async () => {
    const insertFn: InsertFn = jest
      .fn()
      .mockRejectedValue(new Error("something unexpected"));

    const result = await claimEvent("evt_generic_error", insertFn);

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns true when the error is not an Error instance", async () => {
    const insertFn: InsertFn = jest
      .fn()
      .mockRejectedValue("raw string error");

    const result = await claimEvent("evt_raw_error", insertFn);

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Idempotency check failed"),
      "raw string error",
    );
  });

  // ── Distinguishes 23505 from other PG error codes ─────────────────────

  it("only treats code 23505 as a duplicate — other constraint codes are retried", async () => {
    // 23503 = foreign_key_violation — should NOT be treated as duplicate
    const insertFn: InsertFn = jest
      .fn()
      .mockRejectedValue(pgError("foreign key violation", "23503"));

    const result = await claimEvent("evt_fk_error", insertFn);

    expect(result).toBe(true); // Not a duplicate, safe to retry
    expect(warnSpy).toHaveBeenCalled();
  });

  it("treats only exact code 23505 as duplicate, not similar codes", async () => {
    // A hypothetical near-miss code
    const insertFn: InsertFn = jest
      .fn()
      .mockRejectedValue(pgError("not quite unique", "23506"));

    const result = await claimEvent("evt_near_miss", insertFn);

    expect(result).toBe(true);
  });

  // ── Behavioral flow: first claim true, duplicate false ────────────────

  it("simulates real flow: first call succeeds, second is a duplicate", async () => {
    const seen = new Set<string>();
    const insertFn: InsertFn = jest.fn().mockImplementation(async (id: string) => {
      if (seen.has(id)) {
        throw pgError("duplicate key value violates unique constraint", "23505");
      }
      seen.add(id);
    });

    const first = await claimEvent("evt_flow_test", insertFn);
    const second = await claimEvent("evt_flow_test", insertFn);
    const differentEvent = await claimEvent("evt_other", insertFn);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(differentEvent).toBe(true);
  });
});
