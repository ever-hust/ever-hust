import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "../../../lib/openapi-spec";

/** OpenAPI 3.1 document for the public Hust Jobs API. */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json(buildOpenApiSpec(origin), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
