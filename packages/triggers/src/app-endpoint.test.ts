import {
  AppEndpointError,
  MAX_APP_ENDPOINT_TIMEOUT_MS,
  appBaseUrl,
  callAppEndpoint,
} from "./app-endpoint";

type FetchArgs = [string, RequestInit];

function fetchReturning(status: number, body: string) {
  return jest.fn(async (..._args: FetchArgs) => new Response(body, { status }));
}

const env = { NEXT_PUBLIC_APP_URL: "http://hust-web.hust-prod.svc.cluster.local:3000/", CRON_SECRET: "s3cret" };

describe("callAppEndpoint", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("POSTs JSON to base + path with Bearer CRON_SECRET and returns the parsed body", async () => {
    const fetchImpl = fetchReturning(200, JSON.stringify({ ok: true, result: { sent: 2 } }));
    const out = await callAppEndpoint("/api/cron/job-alerts", { frequencies: ["daily"] }, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(out).toEqual({ ok: true, result: { sent: 2 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://hust-web.hust-prod.svc.cluster.local:3000/api/cron/job-alerts");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ frequencies: ["daily"] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([401, 404, 500, 503])("throws on HTTP %i with the status in the message", async (status) => {
    const fetchImpl = fetchReturning(status, JSON.stringify({ error: "nope" }));
    const call = callAppEndpoint("/api/cron/cleanup", {}, { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(call).rejects.toBeInstanceOf(AppEndpointError);
    await expect(
      callAppEndpoint("/api/cron/cleanup", {}, { env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(`POST /api/cron/cleanup failed: HTTP ${status}`);
  });

  it("carries the status and a truncated body on the error, never the secret", async () => {
    const fetchImpl = fetchReturning(500, JSON.stringify({ error: "x".repeat(2000) }));
    const err = (await callAppEndpoint("/api/cron/cleanup", {}, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e: unknown) => e)) as AppEndpointError;
    expect(err.status).toBe(500);
    expect(err.path).toBe("/api/cron/cleanup");
    expect(err.message.length).toBeLessThan(700);
    expect(err.message).not.toContain("s3cret");
  });

  it("maps a timeout to a clear error with status null", async () => {
    const fetchImpl = jest.fn(async () => {
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    });
    const err = (await callAppEndpoint("/api/cron/cleanup", {}, {
      env,
      timeoutMs: 5_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e: unknown) => e)) as AppEndpointError;
    expect(err).toBeInstanceOf(AppEndpointError);
    expect(err.status).toBeNull();
    expect(err.message).toContain("timed out after 5000 ms");
  });

  it("maps a network failure to an error with status null", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      callAppEndpoint("/api/cron/cleanup", {}, { env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("failed before a response");
  });

  it("rejects a 2xx that is not JSON (e.g. an HTML page from a wrong base URL)", async () => {
    const fetchImpl = fetchReturning(200, "<html>login</html>");
    await expect(
      callAppEndpoint("/api/cron/cleanup", {}, { env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("non-JSON body");
  });

  it("clamps the timeout below undici's 300 s header timeout", async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, "timeout");
    const fetchImpl = fetchReturning(200, "{}");
    await callAppEndpoint("/api/cron/cleanup", {}, {
      env,
      timeoutMs: 3_600_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(timeoutSpy).toHaveBeenCalledWith(MAX_APP_ENDPOINT_TIMEOUT_MS);
    expect(MAX_APP_ENDPOINT_TIMEOUT_MS).toBeLessThan(300_000);
    timeoutSpy.mockRestore();
  });

  it("sends no Authorization header when CRON_SECRET is unset (the app then decides)", async () => {
    const fetchImpl = fetchReturning(200, "{}");
    await callAppEndpoint("/api/cron/cleanup", {}, {
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:8443" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("requires an absolute path", async () => {
    await expect(callAppEndpoint("api/cron/cleanup", {}, { env })).rejects.toThrow('must start with "/"');
  });

  it("defaults the base URL to local dev and strips trailing slashes", () => {
    expect(appBaseUrl({})).toBe("http://localhost:8443");
    expect(appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://app.hust.so///" })).toBe("https://app.hust.so");
  });
});
