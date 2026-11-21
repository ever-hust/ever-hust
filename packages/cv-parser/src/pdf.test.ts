/**
 * PDF text extraction runs in the server image: plain Node, no DOM globals
 * (DOMMatrix, ImageData, Path2D) and no native canvas package. pdf-parse needed
 * @napi-rs/canvas to define DOMMatrix, the standalone image never had it, and
 * POST /api/cv/upload failed for every request.
 */
import { extractTextFromPDF, parseCV } from "./index";
import { makeTextPdf } from "./test-pdf";

const CV_LINES = [
  "Jane Doe",
  "jane.doe@example.com",
  "Senior Engineer (2019 - present)",
  "Skills: TypeScript, React, PostgreSQL, Docker",
];

describe("extractTextFromPDF", () => {
  it("runs without DOM globals", () => {
    expect(typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix).toBe("undefined");
  });

  it("reads the text of a real PDF", async () => {
    const text = await extractTextFromPDF(makeTextPdf(CV_LINES));
    for (const line of CV_LINES) expect(text).toContain(line);
  });

  it("leaves the caller's buffer intact", async () => {
    const pdf = makeTextPdf(CV_LINES);
    const copy = Buffer.from(pdf);
    await extractTextFromPDF(pdf);
    expect(pdf.equals(copy)).toBe(true);
  });

  it("rejects bytes that are not a PDF", async () => {
    // Matched by message, not with toThrow(): PDF.js runs in Node's own realm
    // here (see tests/jest/unpdf.cjs), so its InvalidPDFException is not an
    // instance of the Error class the Jest sandbox sees.
    await expect(
      extractTextFromPDF(Buffer.from("not a pdf at all, just text")),
    ).rejects.toMatchObject({ message: expect.stringContaining("Invalid PDF") });
  });
});

describe("parseCV with a PDF", () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => {
    // Basic (pattern) extraction: no network call in a unit test.
    delete process.env.ANTHROPIC_API_KEY;
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    jest.restoreAllMocks();
  });

  it("returns the name, email, skills and raw text", async () => {
    const parsed = await parseCV(makeTextPdf(CV_LINES), "application/pdf");
    expect(parsed.name).toBe("Jane Doe");
    expect(parsed.email).toBe("jane.doe@example.com");
    expect(parsed.skills).toEqual(
      expect.arrayContaining(["TypeScript", "React", "PostgreSQL", "Docker"]),
    );
    expect(parsed.rawText).toContain("Senior Engineer");
  });
});
