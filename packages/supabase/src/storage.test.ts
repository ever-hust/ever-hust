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

import { deleteUserFiles, uploadFile } from "./storage";

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

/**
 * Deleting an account must also erase the files the user uploaded: every CV in
 * cvs/<userId>/ (name, email, phone, work history) and the avatar, whatever its
 * extension. Storage lists a folder 100 entries at a time, so the folder has to
 * be read page by page.
 */
describe("deleteUserFiles", () => {
  const mockList = jest.fn();
  const mockRemove = jest.fn();
  let warn: jest.SpyInstance;

  /** A CV folder with more files than one list page holds. */
  const cvNames = Array.from(
    { length: 150 },
    (_, i) => `${String(i).padStart(3, "0")}.pdf`,
  );

  /** Serve `names` the way Storage does: one page per call, by offset and limit. */
  function serveFolder(names: string[]) {
    mockList.mockImplementation(
      async (_path: string, options: { limit: number; offset: number }) => ({
        data: names
          .slice(options.offset, options.offset + options.limit)
          .map((name) => ({ name, id: `id-${name}` })),
        error: null,
      }),
    );
  }

  /** Every path passed to remove(), across all calls. */
  function removedPaths(): string[] {
    return mockRemove.mock.calls.flatMap((call) => call[0] as string[]);
  }

  beforeEach(() => {
    mockList.mockReset();
    mockRemove.mockReset();
    mockFrom.mockReset();
    mockRemove.mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({ list: mockList, remove: mockRemove });
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("lists cvs/<userId> across two pages and removes every CV plus the three avatar paths", async () => {
    serveFolder(cvNames);

    await expect(deleteUserFiles("u1")).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("user-uploads");
    // Two pages: the first is full, the second is not, so listing stops there.
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList.mock.calls.map((call) => call[0])).toEqual([
      "cvs/u1",
      "cvs/u1",
    ]);
    expect(mockList.mock.calls.map((call) => call[1].offset)).toEqual([0, 100]);
    expect(removedPaths().sort()).toEqual(
      [
        ...cvNames.map((name) => `cvs/u1/${name}`),
        "avatars/u1.jpg",
        "avatars/u1.png",
        "avatars/u1.webp",
      ].sort(),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("removes the avatar paths when the user has no CV", async () => {
    serveFolder([]);

    await deleteUserFiles("u1");

    expect(mockList).toHaveBeenCalledTimes(1);
    expect(removedPaths().sort()).toEqual([
      "avatars/u1.jpg",
      "avatars/u1.png",
      "avatars/u1.webp",
    ]);
  });

  it("logs a failed listing, still removes the avatar paths and does not throw", async () => {
    mockList.mockResolvedValue({ data: null, error: { message: "list down" } });

    await expect(deleteUserFiles("u1")).resolves.toBeUndefined();

    expect(removedPaths()).toEqual(
      expect.arrayContaining([
        "avatars/u1.jpg",
        "avatars/u1.png",
        "avatars/u1.webp",
      ]),
    );
    expect(warn).toHaveBeenCalled();
  });

  it("logs a failed remove and does not throw", async () => {
    serveFolder(["a.pdf"]);
    mockRemove.mockResolvedValue({
      data: null,
      error: { message: "remove down" },
    });

    await expect(deleteUserFiles("u1")).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });

  it("logs and does not throw when Storage is not reachable at all", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("Missing Supabase server environment variables");
    });

    await expect(deleteUserFiles("u1")).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });

  it.each([
    ["an empty id", ""],
    ["a parent segment", ".."],
    ["a nested path", "u1/../u2"],
    ["a slash", "u1/u2"],
    ["a backslash", "u1\\..\\u2"],
    ["a control character", "u1\t"],
  ])("never calls Storage for a user id with %s", async (_label, userId) => {
    await expect(deleteUserFiles(userId)).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
