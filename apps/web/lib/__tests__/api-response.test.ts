import {
  apiSuccess,
  apiError,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiRateLimited,
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

  it("adds no-cache when cacheSeconds = 0", () => {
    const res = apiSuccess({ data: 1 }, { cacheSeconds: 0 });
    expect(res.headers.get("Cache-Control")).toBe(
      "no-cache, no-store, must-revalidate",
    );
  });

  it("omits cache headers when cacheSeconds not set", () => {
    const res = apiSuccess({ data: 1 });
    expect(res.headers.get("Cache-Control")).toBeNull();
  });

  it("merges extra headers", () => {
    const res = apiSuccess({ data: 1 }, { headers: { "X-Custom": "test" } });
    expect(res.headers.get("X-Custom")).toBe("test");
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
});
