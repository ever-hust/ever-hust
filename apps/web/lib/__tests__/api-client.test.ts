/**
 * Tests for api-client — apiFetch and apiMutate helpers.
 *
 * We mock `global.fetch` and `sonner.toast` to verify request options,
 * error handling, and toast behavior.
 */
import { apiFetch, apiMutate } from "../api-client";

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockToastError = jest.fn();

jest.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

// Helper to build a mock Response
function mockResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}

// ── Setup / Teardown ───────────────────────────────────────────────────────
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  // Silence dev-only console.warn from our error logging
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ── apiFetch ───────────────────────────────────────────────────────────────

describe("apiFetch", () => {
  it("returns parsed JSON on a 200 response", async () => {
    const payload = { jobs: [{ id: 1 }] };
    global.fetch = jest.fn().mockResolvedValue(mockResponse(payload));

    const result = await apiFetch<{ jobs: { id: number }[] }>("/api/jobs");

    expect(result).toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith("/api/jobs", expect.any(Object));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("returns null and shows toast on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ error: "Not Found" }, { status: 404 })
    );

    const result = await apiFetch("/api/missing");

    expect(result).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith("Not Found");
  });

  it("extracts 'message' field when 'error' is absent in response body", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ message: "Server busy" }, { status: 503 })
    );

    const result = await apiFetch("/api/busy");

    expect(result).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith("Server busy");
  });

  it("falls back to status code when response body is not JSON", async () => {
    // Return plain text that will fail JSON.parse
    global.fetch = jest.fn().mockResolvedValue(
      new Response("Internal Error", { status: 500 })
    );

    const result = await apiFetch("/api/broken");

    expect(result).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith("Request failed (500)");
  });

  it("uses custom errorMessage when provided", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ error: "Nope" }, { status: 400 })
    );

    await apiFetch("/api/fail", { errorMessage: "Custom error" });

    expect(mockToastError).toHaveBeenCalledWith("Custom error");
  });

  it("does not show toast when showToast is false", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ error: "Nope" }, { status: 400 })
    );

    const result = await apiFetch("/api/fail", { showToast: false });

    expect(result).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("returns null and shows network toast on fetch failure", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await apiFetch("/api/down");

    expect(result).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(
      "Network error. Please check your connection."
    );
  });

  it("returns null and shows generic message on non-network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("JSON parse error"));

    const result = await apiFetch("/api/bad-json");

    expect(result).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith("JSON parse error");
  });

  it("passes through fetchOptions to fetch", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ ok: true }));

    await apiFetch("/api/data", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/data",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer token" },
      })
    );
  });
});

// ── apiMutate ──────────────────────────────────────────────────────────────

describe("apiMutate", () => {
  it("sends POST with JSON body by default", async () => {
    const payload = { success: true };
    global.fetch = jest.fn().mockResolvedValue(mockResponse(payload));

    const result = await apiMutate<{ success: boolean }>("/api/action", {
      body: { jobId: 123 },
    });

    expect(result).toEqual(payload);

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/action");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(
      expect.objectContaining({ "Content-Type": "application/json" })
    );
    expect(options.body).toBe(JSON.stringify({ jobId: 123 }));
  });

  it("uses custom method when specified", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ deleted: true }));

    await apiMutate("/api/thing/1", { method: "DELETE" });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(options.method).toBe("DELETE");
  });

  it("omits body when not provided", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ ok: true }));

    await apiMutate("/api/ping", {});

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(options.body).toBeUndefined();
  });

  it("propagates error handling from apiFetch", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ error: "Forbidden" }, { status: 403 })
    );

    const result = await apiMutate("/api/restricted", {
      body: { data: "x" },
    });

    expect(result).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith("Forbidden");
  });

  it("supports custom headers alongside Content-Type", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ ok: true }));

    await apiMutate("/api/secure", {
      body: { val: 1 },
      headers: { "X-Custom": "yes" },
    });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(options.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
        "X-Custom": "yes",
      })
    );
  });
});
