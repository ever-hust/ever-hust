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

import { uploadFile } from "./storage";

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
