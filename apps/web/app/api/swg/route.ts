/**
 * GET /api/swg — Swagger UI for the public Hust Jobs API.
 *
 * Renders Swagger UI (loaded from a CDN) against the OpenAPI document served at
 * /api/openapi.json. `/api/*` is excluded from the app CSP (see proxy.ts
 * matcher), so the CDN assets load without a policy violation.
 */
export function GET() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <title>Hust API — Swagger UI</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: "/api/openapi.json",
          dom_id: "#swagger-ui",
        });
      };
    </script>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
