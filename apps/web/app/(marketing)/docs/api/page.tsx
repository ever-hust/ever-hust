import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Documentation — Hust",
  description: "Interactive API documentation for the Hust platform",
};

/**
 * /docs/api — Scalar API reference page
 *
 * Renders the interactive Scalar API documentation UI
 * from the OpenAPI spec served at /api/docs.
 */
export default function ApiDocsPage() {
  const specUrl = "/api/docs";

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <h1 className="text-lg font-semibold">Hust API Documentation</h1>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          v1.0
        </span>
      </div>
      {/* Scalar API Reference rendered via script tag */}
      <div className="flex-1" id="api-reference" data-url={specUrl}>
        <script
          id="api-reference-config"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              spec: { url: specUrl },
              theme: "kepler",
              layout: "modern",
              darkMode: true,
              hideModels: false,
              searchHotKey: "k",
            }),
          }}
        />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference" />
      </div>
    </div>
  );
}
