/**
 * POST /api/cv/upload: the client's file name must never become part of the
 * storage key, so a hand-made multipart filename such as "../victim/resume.pdf"
 * can't make the service-role upload write outside cvs/<userId>/.
 *
 * Each upload gets a random key, so nothing is overwritten any more: the CV a
 * new upload replaces is deleted once the new URL is saved, and the new object
 * is deleted again when parsing or saving fails.
 */
const MOCK_STORAGE = "https://storage.example.com/storage/v1/object/public/user-uploads/";
const mockUploadFile = jest.fn();
const mockDeleteFile = jest.fn();
jest.mock("@ever-hust/supabase/storage", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  // Stand-in for the real helper (tested in packages/supabase/src/storage.test.ts).
  storagePathFromPublicUrl: (url: string | null) =>
    url?.startsWith(MOCK_STORAGE) ? url.slice(MOCK_STORAGE.length) : null,
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

/** user-1's row, read under FOR UPDATE and written by the route's transaction. */
const mockUserRow: { skills: string[]; cvUrl: string | null } = {
  skills: [],
  cvUrl: null,
};
const mockDbCalls: string[] = [];
let mockSaveFails = false;
jest.mock("@ever-hust/db", () => ({
  db: {
    transaction: async <T>(fn: (tx: object) => Promise<T>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              for: async (strength: string) => {
                mockDbCalls.push(`select for ${strength}`);
                return [{ ...mockUserRow }];
              },
            }),
          }),
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => {
              mockDbCalls.push(`update ${Object.keys(values).sort().join(",")}`);
              if (mockSaveFails) throw new Error("connection lost");
              Object.assign(mockUserRow, values);
            },
          }),
        }),
      }),
  },
  users: { skills: "skills", cvUrl: "cvUrl", id: "id" },
}));
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));
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
  mockUploadFile.mockImplementation(async (path: string) => `${MOCK_STORAGE}${path}`);
  mockDeleteFile.mockResolvedValue(undefined);
  mockParseCV.mockResolvedValue({
    name: "Jane",
    skills: [],
    experience: [],
    education: [],
    rawText: "x",
  });
  mockUserRow.skills = [];
  mockUserRow.cvUrl = null;
  mockDbCalls.length = 0;
  mockSaveFails = false;
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

describe("POST /api/cv/upload and the CV objects it leaves behind", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    resetMocks();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  const newPath = () => String(mockUploadFile.mock.calls[0][0]);

  it("saves the URL in users.cv_url and deletes the CV it replaces", async () => {
    mockUserRow.cvUrl = `${MOCK_STORAGE}cvs/user-1/old-cv.pdf`;

    const res = await upload("resume.pdf");

    expect(res.status).toBe(200);
    expect(mockUserRow.cvUrl).toBe(`${MOCK_STORAGE}${newPath()}`);
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).toHaveBeenCalledWith("cvs/user-1/old-cv.pdf");
    // Read under a row lock, written in the same transaction.
    expect(mockDbCalls).toEqual([
      "select for update",
      "update cvParsedData,cvUrl,updatedAt",
    ]);
  });

  it("deletes nothing on a first upload", async () => {
    const res = await upload("resume.pdf");

    expect(res.status).toBe(200);
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it("never deletes an object outside the user's own folder", async () => {
    mockUserRow.cvUrl = `${MOCK_STORAGE}cvs/user-2/their-cv.pdf`;

    await upload("resume.pdf");

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it("deletes the new object and keeps the current CV when parsing fails", async () => {
    mockUserRow.cvUrl = `${MOCK_STORAGE}cvs/user-1/old-cv.pdf`;
    mockParseCV.mockRejectedValue(new Error("not a PDF"));

    const res = await upload("resume.pdf");

    expect(res.status).toBe(500);
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).toHaveBeenCalledWith(newPath());
    expect(mockUserRow.cvUrl).toBe(`${MOCK_STORAGE}cvs/user-1/old-cv.pdf`);
    expect(mockDbCalls).toEqual([]);
  });

  it("deletes the new object and keeps the current CV when saving fails", async () => {
    mockUserRow.cvUrl = `${MOCK_STORAGE}cvs/user-1/old-cv.pdf`;
    mockSaveFails = true;

    const res = await upload("resume.pdf");

    expect(res.status).toBe(500);
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).toHaveBeenCalledWith(newPath());
    expect(mockUserRow.cvUrl).toBe(`${MOCK_STORAGE}cvs/user-1/old-cv.pdf`);
  });

  it("answers 200 when deleting the replaced CV fails", async () => {
    mockUserRow.cvUrl = `${MOCK_STORAGE}cvs/user-1/old-cv.pdf`;
    mockDeleteFile.mockRejectedValue(new Error("storage down"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const res = await upload("resume.pdf");

    expect(res.status).toBe(200);
    expect(mockUserRow.cvUrl).toBe(`${MOCK_STORAGE}${newPath()}`);
    warnSpy.mockRestore();
  });

  it("merges the CV's skills into the user's skills", async () => {
    mockUserRow.skills = ["Go"];
    mockParseCV.mockResolvedValue({
      name: "Jane",
      skills: ["Go", "Rust"],
      experience: [],
      education: [],
      rawText: "x",
    });

    await upload("resume.pdf");

    expect(mockUserRow.skills).toEqual(["Go", "Rust"]);
  });
});
