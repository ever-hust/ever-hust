/**
 * POST /api/cv/upload must load in plain Node: no DOM globals and no native
 * canvas package, as in the standalone server image. The route used to import
 * pdf-parse, which evaluated PDF.js as the module loaded; without
 * @napi-rs/canvas that threw "DOMMatrix is not defined", so every request,
 * even one without a session, answered 500.
 *
 * The real @ever-hust/cv-parser is loaded here (not a mock): loading the route
 * must not evaluate PDF.js, which defines DOMMatrix when it loads.
 */
jest.mock("@ever-hust/db", () => ({ db: {}, users: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));
jest.mock("@ever-hust/supabase/storage", () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  storagePathFromPublicUrl: () => null,
}));
jest.mock("../get-session-user", () => ({
  requireSessionUser: async () => {
    const { NextResponse } = jest.requireActual("next/server");
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  },
}));

type Globals = { DOMMatrix?: unknown; ImageData?: unknown; Path2D?: unknown };

describe("POST /api/cv/upload module", () => {
  it("runs without DOM globals", () => {
    const g = globalThis as Globals;
    expect(typeof g.DOMMatrix).toBe("undefined");
    expect(typeof g.ImageData).toBe("undefined");
    expect(typeof g.Path2D).toBe("undefined");
  });

  it("loads without evaluating PDF.js", async () => {
    const route = await import("../../app/api/cv/upload/route");
    expect(typeof route.POST).toBe("function");
    expect(typeof (globalThis as Globals).DOMMatrix).toBe("undefined");
  });

  it("answers 401 to a request without a session", async () => {
    const { POST } = await import("../../app/api/cv/upload/route");
    const form = new FormData();
    form.append("cv", new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" }));
    const res = await POST(
      new Request("http://localhost/api/cv/upload", { method: "POST", body: form }),
    );
    expect(res.status).toBe(401);
  });
});
