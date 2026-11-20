/**
 * POST /api/cv/upload: the client's file name must never become part of the
 * storage key, so a hand-made multipart filename such as "../victim/resume.pdf"
 * can't make the service-role upload write outside cvs/<userId>/.
 *
 * Each upload is stored under a new name, so the route must also remove the CV
 * it replaces, and only when the old URL points inside cvs/<userId>/.
 */
const STORAGE_BASE =
  "https://storage.example.com/storage/v1/object/public/user-uploads/";
const mockUploadFile = jest.fn();
const mockDeleteFile = jest.fn();
jest.mock("@ever-hust/supabase/storage", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  getPublicUrl: (path: string) => `${STORAGE_BASE}${path}`,
}));

const mockParseCV = jest.fn();
jest.mock("@ever-hust/cv-parser", () => ({
  parseCV: (...args: unknown[]) => mockParseCV(...args),
  SUPPORTED_CV_MIME_TYPES: new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ]),
  SUPPORTED_CV_EXTENSIONS: new Set(["pdf", "docx", "txt"]),
}));

/**
 * The signed-in user's row: what the route reads and updates. Like Drizzle, the
 * stand-in drops a SET key that is not a users column and refuses to select an
 * undefined column.
 */
const mockUserRow: Record<string, unknown> = {};
const mockUsers: Record<string, { column: string }> = {
  id: { column: "id" },
  skills: { column: "skills" },
  cvUrl: { column: "cvUrl" },
  cvParsedData: { column: "cvParsedData" },
  updatedAt: { column: "updatedAt" },
};
const mockUpdate = jest.fn();
jest.mock("@ever-hust/db", () => ({
  db: {
    select: (projection: Record<string, { column: string } | undefined>) => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const row: Record<string, unknown> = {};
            for (const [key, col] of Object.entries(projection)) {
              if (!col) throw new Error(`unknown column in select: ${key}`);
              row[key] = mockUserRow[col.column];
            }
            return [row];
          },
        }),
      }),
    }),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  users: mockUsers,
}));
jest.mock("../get-session-user", () => ({
  requireSessionUser: async () => ({ id: "user-1" }),
}));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));

import { POST } from "../../app/api/cv/upload/route";

const PDF_BYTES = "%PDF-1.4 fake resume body";

function upload(fileName: string, type = "application/pdf") {
  const form = new FormData();
  form.append("cv", new File([PDF_BYTES], fileName, { type }));
  return POST(
    new Request("http://localhost/api/cv/upload", {
      method: "POST",
      body: form,
    }),
  );
}

/** Every storage path uploadFile was asked to write. */
function uploadedPaths(): string[] {
  return mockUploadFile.mock.calls.map((call) => String(call[0]));
}

function expectOnlyInsideUserFolder() {
  for (const path of uploadedPaths()) {
    expect(path).not.toContain("..");
    expect(path).not.toContain("\\");
    expect(path.startsWith("cvs/user-1/")).toBe(true);
    expect(path.slice("cvs/user-1/".length)).not.toContain("/");
  }
}

function resetMocks() {
  mockUploadFile.mockReset();
  mockDeleteFile.mockReset();
  mockParseCV.mockReset();
  mockUpdate.mockReset();
  for (const key of Object.keys(mockUserRow)) delete mockUserRow[key];
  Object.assign(mockUserRow, { skills: [], cvUrl: null });
  mockUploadFile.mockImplementation(
    async (path: string) => `${STORAGE_BASE}${path}`,
  );
  mockDeleteFile.mockResolvedValue(undefined);
  mockParseCV.mockResolvedValue({
    name: "Jane",
    skills: [],
    experience: [],
    education: [],
    rawText: "x",
  });
  mockUpdate.mockReturnValue({
    set: (fields: Record<string, unknown>) => ({
      where: async () => {
        for (const [key, value] of Object.entries(fields)) {
          if (key in mockUsers && value !== undefined) mockUserRow[key] = value;
        }
      },
    }),
  });
}

describe("POST /api/cv/upload storage path", () => {
  beforeEach(resetMocks);

  it("refuses a file name that climbs out of the user's folder", async () => {
    const res = await upload("../victim/resume.pdf");
    expectOnlyInsideUserFolder();
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it("refuses a file name that climbs into another bucket", async () => {
    const res = await upload("../../../other/x.pdf");
    expectOnlyInsideUserFolder();
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it.each([
    ["a backslash", "..\\victim\\resume.pdf"],
    ["a forward slash", "victim/resume.pdf"],
    ["a double dot", "resume..pdf"],
  ])("returns 400 for a file name with %s", async (_label, fileName) => {
    const res = await upload(fileName);
    expect(res.status).toBe(400);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("stores a normal CV under a server-chosen name inside cvs/<userId>/", async () => {
    const res = await upload("My Resume.PDF");
    expect(res.status).toBe(200);
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expectOnlyInsideUserFolder();
    const [path, , contentType] = mockUploadFile.mock.calls[0];
    expect(path).toMatch(/^cvs\/user-1\/[0-9a-f-]{36}\.pdf$/);
    expect(path).not.toContain("resume");
    expect(contentType).toBe("application/pdf");
  });

  it("keeps the extension check for names without a supported extension", async () => {
    const res = await upload("resume.exe");
    expect(res.status).toBe(400);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });
});

describe("POST /api/cv/upload and the CV it replaces", () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    resetMocks();
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it("saves the stored CV's URL in users.cv_url", async () => {
    const res = await upload("resume.pdf");

    expect(res.status).toBe(200);
    const path = String(mockUploadFile.mock.calls[0][0]);
    expect(mockUserRow.cvUrl).toBe(`${STORAGE_BASE}${path}`);
  });

  it("removes the first CV's file when the user uploads a second CV", async () => {
    const first = await upload("first.pdf");
    expect(first.status).toBe(200);
    expect(mockDeleteFile).not.toHaveBeenCalled();
    const firstPath = String(mockUploadFile.mock.calls[0][0]);
    expect(mockUserRow.cvUrl).toBe(`${STORAGE_BASE}${firstPath}`);

    const second = await upload("second.pdf");

    expect(second.status).toBe(200);
    const secondPath = String(mockUploadFile.mock.calls[1][0]);
    expect(secondPath).not.toBe(firstPath);
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).toHaveBeenCalledWith(firstPath);
    expect(mockUserRow.cvUrl).toBe(`${STORAGE_BASE}${secondPath}`);
  });

  it.each([
    [
      "another user's CV",
      `${STORAGE_BASE}cvs/user-2/0b6f3c9e-5d2a-4c1f-9a7e-2f1d3c4b5a69.pdf`,
    ],
    [
      "another host",
      "https://evil.example/storage/v1/object/public/user-uploads/cvs/user-1/a.pdf",
    ],
    [
      "another bucket",
      "https://storage.example.com/storage/v1/object/public/other/cvs/user-1/a.pdf",
    ],
    ["a parent segment", `${STORAGE_BASE}cvs/user-1/../user-2/a.pdf`],
    ["an encoded parent segment", `${STORAGE_BASE}cvs/user-1/%2e%2e`],
    ["a sub-folder", `${STORAGE_BASE}cvs/user-1/sub/a.pdf`],
    ["the folder itself", `${STORAGE_BASE}cvs/user-1/`],
    ["a user id that only starts the same", `${STORAGE_BASE}cvs/user-10/a.pdf`],
    ["the user's avatar", `${STORAGE_BASE}avatars/user-1.png`],
    ["a query string", `${STORAGE_BASE}cvs/user-1/a.pdf?x=1`],
    ["a URL that is not one", "not a url"],
  ])(
    "never removes a previous CV URL pointing at %s",
    async (_label, oldUrl) => {
      mockUserRow.cvUrl = oldUrl;

      const res = await upload("resume.pdf");

      expect(res.status).toBe(200);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    },
  );

  it("keeps the previous CV when saving the new one fails", async () => {
    mockUserRow.cvUrl = `${STORAGE_BASE}cvs/user-1/old.pdf`;
    mockUpdate.mockReturnValue({
      set: () => ({
        where: async () => {
          throw new Error("db down");
        },
      }),
    });

    const res = await upload("resume.pdf");

    expect(res.status).toBe(500);
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it("still answers 200 when removing the previous CV fails", async () => {
    mockUserRow.cvUrl = `${STORAGE_BASE}cvs/user-1/old.pdf`;
    mockDeleteFile.mockRejectedValue(new Error("storage down"));

    const res = await upload("resume.pdf");

    expect(res.status).toBe(200);
    expect(mockDeleteFile).toHaveBeenCalledWith("cvs/user-1/old.pdf");
  });
});
