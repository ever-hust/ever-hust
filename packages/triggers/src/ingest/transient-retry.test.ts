import { describe, it, expect, jest } from "@jest/globals";
import {
  DEFAULT_TRANSIENT_ATTEMPTS,
  DEFAULT_TRANSIENT_DELAYS_MS,
  isTransientConnectionError,
  withTransientRetry,
} from "./transient-retry";

/** What Node's resolver throws on a DNS blip (the hust-dev abort of 2026-09-27). */
const dnsBlip = () =>
  Object.assign(new Error("getaddrinfo EAI_AGAIN pg-rw.databases.svc.cluster.local"), {
    code: "EAI_AGAIN",
    errno: -3001,
    syscall: "getaddrinfo",
    hostname: "pg-rw.databases.svc.cluster.local",
  });
/** Drizzle's wrapper: `Failed query: <sql>\nparams: …`, the driver error in `cause`. */
const drizzleWrapped = (cause: unknown) => Object.assign(new Error('Failed query: select 1\nparams: '), { cause });
/** postgres.js's error for an answer from the server: a SQLSTATE plus a severity. */
const serverError = (code: string, message: string) =>
  Object.assign(new Error(message), { name: "PostgresError", code, severity: "ERROR", severity_local: "ERROR" });

describe("isTransientConnectionError", () => {
  it.each([
    ["EAI_AGAIN (DNS lookup failed for now)", dnsBlip(), true],
    ["ENOTFOUND (cluster DNS flapping)", Object.assign(new Error("getaddrinfo ENOTFOUND pg-rw"), { code: "ENOTFOUND" }), true],
    ["ECONNRESET", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }), true],
    ["ETIMEDOUT", Object.assign(new Error("connect ETIMEDOUT 10.0.0.1:5432"), { code: "ETIMEDOUT" }), true],
    ["postgres.js CONNECT_TIMEOUT", Object.assign(new Error("write CONNECT_TIMEOUT pg-rw:5432"), { code: "CONNECT_TIMEOUT" }), true],
    ["a DNS blip wrapped by Drizzle", drizzleWrapped(dnsBlip()), true],
    ["a DNS blip two causes deep", Object.assign(new Error("batch failed"), { cause: drizzleWrapped(dnsBlip()) }), true],
    ["a statement timeout (57014)", drizzleWrapped(serverError("57014", "canceling statement due to statement timeout")), false],
    ["a unique violation (23505)", serverError("23505", "duplicate key value violates unique constraint"), false],
    ["a serialization failure (40001)", serverError("40001", "could not serialize access"), false],
    ["a server error wrapping a transient code", Object.assign(serverError("08006", "connection failure"), { cause: dnsBlip() }), false],
    ["ECONNREFUSED (deliberately not retried)", Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }), false],
    ["postgres.js CONNECTION_CLOSED (deliberately not retried)", Object.assign(new Error("closed"), { code: "CONNECTION_CLOSED" }), false],
    ["our own RangeError", new RangeError("upsertBatch got 251 rows"), false],
    ["a plain message that mentions EAI_AGAIN", new Error("getaddrinfo EAI_AGAIN somewhere"), false],
    ["not an error", "EAI_AGAIN", false],
    ["null", null, false],
  ])("%s → %s", (_name, err, expected) => {
    expect(isTransientConnectionError(err)).toBe(expected);
  });
});

describe("withTransientRetry", () => {
  const noWait = () => {
    const waits: number[] = [];
    return { waits, sleep: async (ms: number) => void waits.push(ms) };
  };

  it("retries a transient connection error with backoff and returns the first success", async () => {
    const { waits, sleep } = noWait();
    const onRetry = jest.fn();
    const run = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(dnsBlip())
      .mockRejectedValueOnce(drizzleWrapped(dnsBlip()))
      .mockResolvedValueOnce("written");
    await expect(withTransientRetry(run, { sleep, onRetry })).resolves.toBe("written");
    expect(run).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([500, 1_500]);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ code: "EAI_AGAIN", attempt: 1, attempts: 4, delayMs: 500 });
  });

  it("is bounded: after the last attempt the last error is thrown as is", async () => {
    const { waits, sleep } = noWait();
    const last = dnsBlip();
    const run = jest
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(dnsBlip())
      .mockRejectedValueOnce(dnsBlip())
      .mockRejectedValueOnce(dnsBlip())
      .mockRejectedValueOnce(last);
    await expect(withTransientRetry(run, { sleep, onRetry: () => {} })).rejects.toBe(last);
    expect(run).toHaveBeenCalledTimes(DEFAULT_TRANSIENT_ATTEMPTS);
    expect(waits).toEqual([...DEFAULT_TRANSIENT_DELAYS_MS]);
    // ≈ 6.5 s in all: a database that is really down still fails its batch quickly.
    expect(waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(7_000);
  });

  it("never retries an error the server answered, or any non-transient error", async () => {
    for (const err of [
      drizzleWrapped(serverError("57014", "canceling statement due to statement timeout")),
      serverError("23505", "duplicate key"),
      new RangeError("too many rows"),
    ]) {
      const { waits, sleep } = noWait();
      const run = jest.fn<() => Promise<never>>().mockRejectedValue(err);
      await expect(withTransientRetry(run, { sleep, onRetry: () => {} })).rejects.toBe(err);
      expect(run).toHaveBeenCalledTimes(1);
      expect(waits).toEqual([]);
    }
  });

  it("honours a custom bound; attempts: 1 is no retry; a throwing onRetry changes nothing", async () => {
    const { sleep } = noWait();
    const once = jest.fn<() => Promise<never>>().mockRejectedValue(dnsBlip());
    await expect(withTransientRetry(once, { attempts: 1, sleep })).rejects.toMatchObject({ code: "EAI_AGAIN" });
    expect(once).toHaveBeenCalledTimes(1);

    const { waits, sleep: sleep2 } = noWait();
    const run = jest.fn<() => Promise<number>>().mockRejectedValueOnce(dnsBlip()).mockResolvedValueOnce(1);
    const onRetry = () => {
      throw new Error("logger broke");
    };
    await expect(withTransientRetry(run, { attempts: 2, delaysMs: [10], sleep: sleep2, onRetry })).resolves.toBe(1);
    expect(waits).toEqual([10]);
  });

  it("logs one warning line per retry by default, without the statement's parameters", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { sleep } = noWait();
      const run = jest.fn<() => Promise<number>>().mockRejectedValueOnce(drizzleWrapped(dnsBlip())).mockResolvedValueOnce(1);
      await withTransientRetry(run, { sleep });
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]![0]);
      expect(line).toContain("transient database connection error (EAI_AGAIN) on attempt 1/4; retrying in 500 ms");
      expect(line).toContain("getaddrinfo EAI_AGAIN pg-rw.databases.svc.cluster.local");
      expect(line).not.toContain("params:");
    } finally {
      warn.mockRestore();
    }
  });
});
