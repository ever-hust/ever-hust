import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") ?? "AI-Powered Job Search";
  const description =
    searchParams.get("description") ??
    "Find, apply, and land your dream job through natural conversation.";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Accent gradient circle */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-120px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            opacity: 0.15,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-80px",
            left: "-80px",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
            opacity: 0.1,
            display: "flex",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 80px",
            maxWidth: "100%",
          }}
        >
          {/* Logo / Brand */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "32px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "16px",
                fontSize: "24px",
                color: "white",
                fontWeight: 700,
              }}
            >
              EJ
            </div>
            <span
              style={{
                fontSize: "28px",
                fontWeight: 600,
                color: "#e2e8f0",
                letterSpacing: "-0.02em",
              }}
            >
              Ever Jobs
            </span>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: title.length > 30 ? "48px" : "56px",
              fontWeight: 800,
              color: "white",
              textAlign: "center",
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              margin: "0 0 20px 0",
              maxWidth: "900px",
            }}
          >
            {title}
          </h1>

          {/* Description */}
          <p
            style={{
              fontSize: "22px",
              color: "#94a3b8",
              textAlign: "center",
              lineHeight: 1.5,
              margin: 0,
              maxWidth: "700px",
            }}
          >
            {description}
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
