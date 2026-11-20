/**
 * uploadFile writes with the service-role key, and @supabase/storage-js puts the
 * path into the request URL unencoded. A ".." or "." segment (also as %2e) or a
 * backslash would be resolved by the URL parser and could reach another folder
 * or bucket, so uploadFile must refuse such paths before calling Storage.
 */
const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockFrom = jest.fn();
jest.mock("./server", () => ({
  getSupabaseServer: () => ({
    storage: { from: (...args: unknown[]) => mockFrom(...args) },
  }),
}));

import { deleteFile, storagePathFromPublicUrl, uploadFile } from "./storage";

const data = Buffer.from("hello world");

describe("uploadFile path guard", () => {
  beforeEach(() => {
    mockUpload.mockReset();
    mockGetPublicUrl.mockReset();
    mockFrom.mockReset();
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://storage.example.com/${path}` },
    }));
    mockFrom.mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    });
  });

  it.each([
    ["a parent segment", "cvs/user-1/../victim/resume.pdf"],
    ["a leading parent segment", "../other/x.pdf"],
    ["a trailing parent segment", "cvs/user-1/.."],
    ["a current-directory segment", "cvs/./user-1/cv.pdf"],
    ["a lone dot", "."],
    ["a backslash", "cvs\\user-1\\cv.pdf"],
    ["a backslash parent segment", "cvs/user-1/..\\..\\other\\x.pdf"],
    ["a percent-encoded parent segment", "cvs/user-1/%2e%2e/victim/x.pdf"],
    [
      "a mixed-case percent-encoded parent segment",
      "cvs/user-1/.%2E/victim/x.pdf",
    ],
    ["a percent-encoded current-directory segment", "cvs/%2e/user-1/cv.pdf"],
    // The URL parser drops tab, CR and LF, so these become ".." segments.
    ["a tab inside a parent segment", "cvs/user-1/.\t./.\t./.\t./other/x.pdf"],
    ["a line feed inside a parent segment", "cvs/user-1/.\n./victim/x.pdf"],
    [
      "a carriage return inside a parent segment",
      "cvs/user-1/.\r./victim/x.pdf",
    ],
    ["a tab between encoded dots", "cvs/user-1/%2e\t%2e/victim/x.pdf"],
    ["a leading tab before a parent segment", "cvs/user-1/\t../victim/x.pdf"],
    ["a NUL character", "cvs/user-1/cv.pdf\u0000"],
    ["a DEL character", "cvs/user-1/cv\u007f.pdf"],
  ])(
    "throws for a path with %s and never calls Storage",
    async (_label, path) => {
      await expect(uploadFile(path, data, "application/pdf")).rejects.toThrow(
        /Invalid storage path/,
      );
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockUpload).not.toHaveBeenCalled();
    },
  );

  it("does not echo the refused path in the error", async () => {
    const error = await uploadFile(
      "cvs/u/../secret-name.pdf",
      data,
      "application/pdf",
    ).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Invalid storage path/);
    expect((error as Error).message).not.toContain("secret-name");
  });

  it.each([
    ["a CV path", "cvs/user-1/0b6f3c9e-5d2a-4c1f-9a7e-2f1d3c4b5a69.pdf"],
    ["an avatar path", "avatars/user-1.webp"],
    [
      "a file name with dots that are not a segment",
      "cvs/user-1/my.resume.v2.pdf",
    ],
    ["a segment that starts with dots", "cvs/user-1/..hidden.pdf"],
  ])("uploads %s unchanged", async (_label, path) => {
    const url = await uploadFile(path, data, "application/pdf");
    expect(mockFrom).toHaveBeenCalledWith("user-uploads");
    expect(mockUpload).toHaveBeenCalledWith(path, data, {
      contentType: "application/pdf",
      upsert: true,
    });
    expect(url).toBe(`https://storage.example.com/${path}`);
  });

  it("guards paths for a non-default bucket too", async () => {
    await expect(
      uploadFile("../user-uploads/x.pdf", data, "application/pdf", "other"),
    ).rejects.toThrow(/Invalid storage path/);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe("storagePathFromPublicUrl", () => {
  const base =
    "https://abc.supabase.co/storage/v1/object/public/user-uploads/";

  it.each([
    ["a CV URL", `${base}cvs/user-1/0b6f3c9e.pdf`, "cvs/user-1/0b6f3c9e.pdf"],
    ["an encoded file name", `${base}cvs/user-1/My%20Resume.pdf`, "cvs/user-1/My Resume.pdf"],
    ["a URL with a query string", `${base}cvs/user-1/cv.pdf?download=1`, "cvs/user-1/cv.pdf"],
  ])("returns the path of %s", (_label, url, path) => {
    expect(storagePathFromPublicUrl(url)).toBe(path);
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["not a URL", "cvs/user-1/cv.pdf"],
    ["another bucket", "https://abc.supabase.co/storage/v1/object/public/other/cvs/user-1/cv.pdf"],
    ["a signed URL", "https://abc.supabase.co/storage/v1/object/sign/user-uploads/cvs/user-1/cv.pdf"],
    ["the bucket root", base],
    ["a parent segment", `${base}cvs/user-1/../user-2/cv.pdf`],
    ["an encoded parent segment", `${base}cvs/user-1/%2e%2e/user-2/cv.pdf`],
    ["an encoded backslash", `${base}cvs/user-1/..%5Cuser-2%5Ccv.pdf`],
    ["broken percent-encoding", `${base}cvs/user-1/%E0%A4%A.pdf`],
  ])("returns null for %s", (_label, url) => {
    expect(storagePathFromPublicUrl(url)).toBeNull();
  });
});

describe("deleteFile path guard", () => {
  const mockRemove = jest.fn();
  beforeEach(() => {
    mockFrom.mockReset();
    mockRemove.mockReset();
    mockRemove.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ remove: mockRemove });
  });

  it("deletes a safe path", async () => {
    await deleteFile("cvs/user-1/cv.pdf");
    expect(mockRemove).toHaveBeenCalledWith(["cvs/user-1/cv.pdf"]);
  });

  it("throws for a parent segment and never calls Storage", async () => {
    await expect(deleteFile("cvs/user-1/../user-2/cv.pdf")).rejects.toThrow(
      /Invalid storage path/,
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
