import {
  apiSuccess,
  apiError,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiRateLimited,
  generateRequestId,
  safeJsonParse,
} from "../api-response";

// Helper to extract JSON body from NextResponse
async function jsonBody(response: Response) {
  return response.json();
}

describe("apiSuccess", () => {
  it("returns 200 with data", async () => {
    const res = apiSuccess({ foo: "bar" });
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual({ foo: "bar" });
  });

  it("returns custom status", async () => {
    const res = apiSuccess({ created: true }, { status: 201 });
    expect(res.status).toBe(201);
  });

  it("adds cache headers when cacheSeconds > 0", () => {
    const res = apiSuccess({ data: 1 }, { cacheSeconds: 300 });
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
  });

  it("adds private cache header when isPrivate is true", () => {
    const res = apiSuccess({ data: 1 }, { cacheSeconds: 120, isPrivate: true });
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=120");
  });

  it("adds private no-cache when cacheSeconds = 0 and isPrivate", () => {
    const res = apiSuccess({ data: 1 }, { cacheSeconds: 0, isPrivate: true });
    expect(res.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate",
    );
  });

  it("adds no-cache when cacheSeconds = 0", () => {
    const res = apiSuccess({ data: 1 }, { cacheSeconds: 0 });
    expect(res.headers.get("Cache-Control")).toBe(
      "no-cache, no-store, must-revalidate",
    );
  });

  it("defaults to private no-cache when cacheSeconds not set", () => {
    const res = apiSuccess({ data: 1 });
    expect(res.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate",
    );
  });

  it("merges extra headers", () => {
    const res = apiSuccess({ data: 1 }, { headers: { "X-Custom": "test" } });
    expect(res.headers.get("X-Custom")).toBe("test");
  });

  it("defaults to private no-cache for negative cacheSeconds", () => {
    const res = apiSuccess({ data: 1 }, { cacheSeconds: -1 });
    expect(res.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate",
    );
  });

  it("always includes X-Request-Id even with extra headers", () => {
    const res = apiSuccess({ data: 1 }, { headers: { "X-Custom": "v" } });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(res.headers.get("X-Custom")).toBe("v");
  });

  it("handles null data", async () => {
    const res = apiSuccess(null);
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toBeNull();
  });

  it("handles array data", async () => {
    const res = apiSuccess([1, 2, 3]);
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual([1, 2, 3]);
  });
});

describe("apiError", () => {
  it("returns 500 by default", async () => {
    const res = apiError("Something went wrong");
    expect(res.status).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Something went wrong" });
  });

  it("returns custom status", async () => {
    const res = apiError("Not found", 404);
    expect(res.status).toBe(404);
  });

  it("includes details when provided", async () => {
    const res = apiError("Bad input", 400, { field: "email" });
    const body = await jsonBody(res);
    expect(body.error).toBe("Bad input");
    expect(body.details).toEqual({ field: "email" });
  });

  it("omits details when not provided", async () => {
    const res = apiError("Server error");
    const body = await jsonBody(res);
    expect(body).not.toHaveProperty("details");
  });
});

describe("apiBadRequest", () => {
  it("returns 400 with default message", async () => {
    const res = apiBadRequest();
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid request" });
  });

  it("returns 400 with custom message", async () => {
    const res = apiBadRequest("Missing field: name");
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Missing field: name" });
  });
});

describe("apiUnauthorized", () => {
  it("returns 401 with default message", async () => {
    const res = apiUnauthorized();
    expect(res.status).toBe(401);
    expect(await jsonBody(res)).toEqual({ error: "Authentication required" });
  });
});

describe("apiForbidden", () => {
  it("returns 403 with default message", async () => {
    const res = apiForbidden();
    expect(res.status).toBe(403);
    expect(await jsonBody(res)).toEqual({ error: "Insufficient permissions" });
  });

  it("returns 403 with custom message", async () => {
    const res = apiForbidden("Upgrade to Pro required");
    expect(await jsonBody(res)).toEqual({ error: "Upgrade to Pro required" });
  });
});

describe("apiNotFound", () => {
  it("returns 404 with default message", async () => {
    const res = apiNotFound();
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Resource not found" });
  });
});

describe("apiRateLimited", () => {
  it("returns 429 with Retry-After header", async () => {
    const res = apiRateLimited(60);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await jsonBody(res);
    expect(body.retryAfter).toBe(60);
    expect(body.error).toContain("Too many requests");
  });

  it("includes Cache-Control no-cache header", () => {
    const res = apiRateLimited(30);
    expect(res.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate",
    );
  });

  it("includes X-Request-Id header", () => {
    const res = apiRateLimited(10);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });
});

// ── Request ID tracing ──────────────────────────────────────────────────

describe("generateRequestId", () => {
  it("returns a non-empty string", () => {
    const id = generateRequestId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates unique IDs on consecutive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateRequestId()));
    expect(ids.size).toBe(50);
  });
});

describe("X-Request-Id header", () => {
  it("is present on success responses", () => {
    const res = apiSuccess({ ok: true });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("is present on error responses", () => {
    const res = apiError("fail");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("is present on 400 responses", () => {
    const res = apiBadRequest();
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("is present on 401 responses", () => {
    const res = apiUnauthorized();
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("is present on 403 responses", () => {
    const res = apiForbidden();
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("is present on 404 responses", () => {
    const res = apiNotFound();
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("is present on 429 responses", () => {
    const res = apiRateLimited(30);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("is unique across different responses", () => {
    const ids = [
      apiSuccess({}).headers.get("X-Request-Id"),
      apiError("x").headers.get("X-Request-Id"),
      apiBadRequest().headers.get("X-Request-Id"),
    ];
    expect(new Set(ids).size).toBe(3);
  });
});

// ── safeJsonParse ──────────────────────────────────────────────────────

describe("safeJsonParse", () => {
  it("returns ok:true with parsed data for valid JSON body", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJsonParse(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ name: "Alice" });
    }
  });

  it("returns ok:false with 400 response for invalid JSON", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{ invalid json",
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJsonParse(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toContain("Invalid or missing JSON body");
    }
  });

  it("returns ok:false for request with no body", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
    });
    const result = await safeJsonParse(req);
    expect(result.ok).toBe(false);
  });

  it("parses arrays, numbers, and nested objects", async () => {
    const data = { items: [1, 2, 3], nested: { deep: true } };
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJsonParse(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(data);
    }
  });

  it("parses JSON string literal", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify("hello"),
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJsonParse(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("hello");
    }
  });

  it("parses JSON null literal", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJsonParse(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it("returns ok:false for empty string body", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: "",
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJsonParse(req);
    expect(result.ok).toBe(false);
  });
});
