"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
            textAlign: "center",
            backgroundColor: "#fafafa",
          }}
        >
          <div
            style={{
              fontSize: "3rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
              color: "#111",
            }}
            aria-hidden="true"
          >
            500
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              color: "#6b7280",
              maxWidth: "400px",
              lineHeight: 1.5,
            }}
          >
            An unexpected error occurred. Please try refreshing the page. If the
            problem persists, contact support.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.5rem",
                color: "#9ca3af",
                fontSize: "0.75rem",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1.5rem",
                backgroundColor: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                padding: "0.5rem 1.5rem",
                backgroundColor: "transparent",
                color: "#000",
                border: "1px solid #d1d5db",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
