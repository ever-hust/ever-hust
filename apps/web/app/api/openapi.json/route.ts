import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "../../../lib/openapi-spec";

/** OpenAPI 3.1 document for the public Hust Jobs API. */
export function GET(req: Request) {
  // Prefer the public app URL so Scalar/Swagger "Try it" targets the real host.
  // Behind the k8s ingress, req.url's host is the internal pod address.
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(req.url).origin);
  return NextResponse.json(buildOpenApiSpec(origin), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
