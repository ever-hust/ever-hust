import { z } from "zod";
import type { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ArtifactDocument } from "../../../../lib/pdf/artifact-document";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiBadRequest, apiError, safeJsonParse } from "../../../../lib/api-response";

// @react-pdf/renderer needs the Node.js runtime (not edge).
export const runtime = "nodejs";

const pdfRequestSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  data: z.record(z.string(), z.unknown()),
});

// POST /api/documents/pdf — render an advisory artifact (cover letter, résumé, …) to a PDF
// download (spec #10/#11). Server-side via @react-pdf/renderer; auth + rate-limit gated.
export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const rateLimited = applyRateLimit(userId, "export");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = pdfRequestSchema.safeParse(jsonResult.data);
  if (!parsed.success) return apiBadRequest("Invalid document payload");

  try {
    // ArtifactDocument returns a <Document> element; cast to renderToBuffer's expected
    // ReactElement<DocumentProps> (the lib types the param more narrowly than our return).
    const element = ArtifactDocument({
      title: parsed.data.title,
      subtitle: parsed.data.subtitle,
      data: parsed.data.data as Record<string, unknown>,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(element);
    const filename = `${parsed.data.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(
      "[api/documents/pdf] render failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to render the document PDF");
  }
}
