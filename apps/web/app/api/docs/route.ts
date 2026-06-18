/**
 * GET /api/docs — Scalar API Reference for the public Hust Jobs API.
 *
 * Renders the Scalar UI (loaded from a CDN) against the OpenAPI document served
 * at /api/openapi.json. `/api/*` is excluded from the app CSP (see proxy.ts
 * matcher), so the CDN script loads without a policy violation. The raw spec is
 * available at /api/openapi.json; Swagger UI is at /api/swg.
 */
export function GET() {
  const html = `<!doctype html>
<html>
  <head>
    <title>Hust API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
  </head>
  <body>
    <script id="api-reference" data-url="/api/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
