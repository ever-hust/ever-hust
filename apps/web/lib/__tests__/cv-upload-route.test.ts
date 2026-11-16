/**
 * POST /api/cv/upload: the client's file name must never become part of the
 * storage key, so a hand-made multipart filename such as "../victim/resume.pdf"
 * can't make the service-role upload write outside cvs/<userId>/.
 */
const mockUploadFile = jest.fn();
jest.mock("@ever-hust/supabase/storage", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
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

const mockUpdate = jest.fn();
jest.mock("@ever-hust/db", () => ({
  db: {
    select: jest.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  users: {},
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

describe("POST /api/cv/upload storage path", () => {
  beforeEach(() => {
    mockUploadFile.mockReset();
    mockParseCV.mockReset();
    mockUpdate.mockReset();
    mockUploadFile.mockResolvedValue("https://storage.example.com/cv");
    mockParseCV.mockResolvedValue({
      name: "Jane",
      skills: [],
      experience: [],
      education: [],
      rawText: "x",
    });
    mockUpdate.mockReturnValue({
      set: () => ({ where: async () => undefined }),
    });
  });

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
