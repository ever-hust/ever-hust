"use client";

import { useState, useCallback } from "react";
import {
  Book,
  Key,
  Copy,
  Check,
  ArrowLeft,
  Shield,
  Zap,
} from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";

// ---------------------------------------------------------------------------
// Code block component with copy button
// ---------------------------------------------------------------------------

function CodeBlock({
  code,
  language = "bash",
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [code]);

  return (
    <div className="group relative rounded-lg border bg-muted">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase text-muted-foreground">
          {language}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={handleCopy}
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Endpoint section component
// ---------------------------------------------------------------------------

interface EndpointProps {
  method: string;
  path: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  responseExample: string;
  curlExample: string;
  jsExample: string;
}

function EndpointSection({
  method,
  path,
  description,
  params,
  responseExample,
  curlExample,
  jsExample,
}: EndpointProps) {
  const [activeTab, setActiveTab] = useState<"curl" | "javascript">("curl");

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Badge
          variant="secondary"
          className="font-mono text-[10px] font-semibold"
        >
          {method}
        </Badge>
        <code className="text-sm font-semibold">{path}</code>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>

      {/* Query parameters */}
      {params && params.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">
            Parameters
          </h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs" role="table">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Required</th>
                  <th className="pb-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {params.map((param) => (
                  <tr key={param.name} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        {param.name}
                      </code>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {param.type}
                    </td>
                    <td className="py-2 pr-4">
                      {param.required ? (
                        <Badge variant="default" className="text-[9px]">
                          Required
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Optional</span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {param.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Code examples */}
      <div className="mt-4">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("curl")}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "curl"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            cURL
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("javascript")}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "javascript"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            JavaScript
          </button>
        </div>
        <CodeBlock
          code={activeTab === "curl" ? curlExample : jsExample}
          language={activeTab === "curl" ? "bash" : "javascript"}
        />
      </div>

      {/* Response example */}
      <div className="mt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Response
        </h4>
        <CodeBlock code={responseExample} language="json" />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const BASE_URL = "https://everjobs.ai/api/v1";

export default function ApiDocsPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={Book}
        title="API Documentation"
        description="Reference for the Ever Jobs developer API."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings#developer-api">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Back to Settings
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Authentication */}
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Key className="h-4 w-4" aria-hidden="true" />
              Authentication
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              All API requests require authentication via an API key passed in
              the <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization</code> header
              as a Bearer token. You can create API keys from the{" "}
              <Link
                href="/settings#developer-api"
                className="text-primary underline hover:no-underline"
              >
                Developer API settings
              </Link>
              .
            </p>
            <CodeBlock
              code={`curl ${BASE_URL}/jobs \\
  -H "Authorization: Bearer ej_live_your_api_key_here"`}
              language="bash"
            />
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed p-3">
              <Shield
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground">
                Keep your API key secret. Do not expose it in client-side code
                or public repositories. If compromised, revoke it immediately
                from settings and create a new one.
              </p>
            </div>
          </Card>

          {/* Base URL & Rate Limits */}
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4" aria-hidden="true" />
              Base URL & Rate Limits
            </h2>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>Base URL:</strong>{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {BASE_URL}
                </code>
              </p>
              <p>
                <strong>Rate Limit:</strong> Determined by your API key
                configuration (default: 1,000 requests/hour). The following
                headers are included in every response:
              </p>
              <ul className="ml-4 list-disc space-y-1 text-xs">
                <li>
                  <code className="rounded bg-muted px-1 py-0.5">
                    X-RateLimit-Limit
                  </code>{" "}
                  — Maximum requests per hour
                </li>
                <li>
                  <code className="rounded bg-muted px-1 py-0.5">
                    X-RateLimit-Remaining
                  </code>{" "}
                  — Remaining requests in the current window
                </li>
                <li>
                  <code className="rounded bg-muted px-1 py-0.5">
                    Retry-After
                  </code>{" "}
                  — Seconds to wait when rate limited (429 responses only)
                </li>
              </ul>
            </div>
          </Card>

          {/* Error format */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Error Responses</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              All error responses follow a consistent format:
            </p>
            <CodeBlock
              code={`{
  "error": "Human-readable error message",
  "retryAfter": 42  // Only present on 429 responses
}`}
              language="json"
            />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs" role="table">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-[10px]">400</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      Bad Request — invalid parameters
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-[10px]">401</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      Unauthorized — missing or invalid API key
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-[10px]">404</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      Not Found — resource does not exist
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-[10px]">429</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      Too Many Requests — rate limit exceeded
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-[10px]">500</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      Internal Server Error
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Separator />

          {/* Endpoints */}
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Endpoints
          </h2>

          {/* GET /jobs */}
          <EndpointSection
            method="GET"
            path="/api/v1/jobs"
            description="Search and filter jobs. Returns paginated results sorted by posting date (newest first)."
            params={[
              { name: "q", type: "string", required: false, description: "Search keyword (matches title and description)" },
              { name: "location", type: "string", required: false, description: "Filter by city, state, or country" },
              { name: "remote", type: "boolean", required: false, description: "Filter remote jobs (true/false)" },
              { name: "salaryMin", type: "number", required: false, description: "Minimum salary filter" },
              { name: "salaryMax", type: "number", required: false, description: "Maximum salary filter" },
              { name: "skills", type: "string", required: false, description: "Comma-separated skill names" },
              { name: "limit", type: "integer", required: false, description: "Results per page (1-100, default: 20)" },
              { name: "offset", type: "integer", required: false, description: "Pagination offset (default: 0)" },
            ]}
            curlExample={`curl "${BASE_URL}/jobs?q=react+developer&location=San+Francisco&remote=true&limit=10" \\
  -H "Authorization: Bearer ej_live_your_api_key_here"`}
            jsExample={`const response = await fetch(
  "${BASE_URL}/jobs?" + new URLSearchParams({
    q: "react developer",
    location: "San Francisco",
    remote: "true",
    limit: "10",
  }),
  {
    headers: {
      Authorization: "Bearer ej_live_your_api_key_here",
    },
  }
);

const data = await response.json();
console.log(data.jobs);    // Array of job objects
console.log(data.total);   // Total matching jobs
console.log(data.hasMore); // Whether more pages exist`}
            responseExample={`{
  "jobs": [
    {
      "id": 12345,
      "externalId": "abc-123",
      "title": "Senior React Developer",
      "companyName": "Acme Corp",
      "companyLogo": "https://...",
      "companyUrl": "https://acme.com",
      "jobUrl": "https://...",
      "locationCity": "San Francisco",
      "locationState": "CA",
      "locationCountry": "US",
      "isRemote": true,
      "jobType": "fulltime",
      "description": "We are looking for...",
      "skills": ["React", "TypeScript", "Node.js"],
      "salaryMin": "120000",
      "salaryMax": "180000",
      "salaryCurrency": "USD",
      "salaryInterval": "yearly",
      "datePosted": "2026-02-15T00:00:00.000Z"
    }
  ],
  "total": 142,
  "limit": 10,
  "offset": 0,
  "hasMore": true
}`}
          />

          {/* GET /jobs/:id */}
          <EndpointSection
            method="GET"
            path="/api/v1/jobs/:jobId"
            description="Retrieve full details for a single job by its numeric ID. Includes additional fields like company description, team, and expiry date."
            params={[
              { name: "jobId", type: "integer", required: true, description: "The numeric job ID (URL path parameter)" },
            ]}
            curlExample={`curl "${BASE_URL}/jobs/12345" \\
  -H "Authorization: Bearer ej_live_your_api_key_here"`}
            jsExample={`const jobId = 12345;
const response = await fetch(
  \`${BASE_URL}/jobs/\${jobId}\`,
  {
    headers: {
      Authorization: "Bearer ej_live_your_api_key_here",
    },
  }
);

const data = await response.json();
console.log(data.job); // Full job object`}
            responseExample={`{
  "job": {
    "id": 12345,
    "externalId": "abc-123",
    "site": "linkedin",
    "title": "Senior React Developer",
    "companyName": "Acme Corp",
    "companyUrl": "https://acme.com",
    "companyLogo": "https://...",
    "companyIndustry": "Technology",
    "companyNumEmployees": "1001-5000",
    "companyDescription": "Acme Corp builds...",
    "jobUrl": "https://...",
    "applyUrl": "https://...",
    "locationCity": "San Francisco",
    "locationState": "CA",
    "locationCountry": "US",
    "isRemote": true,
    "jobType": "fulltime",
    "description": "Full job description...",
    "skills": ["React", "TypeScript"],
    "department": "Engineering",
    "team": "Frontend",
    "employmentType": "full-time",
    "jobLevel": "senior",
    "jobFunction": "Engineering",
    "salaryMin": "120000",
    "salaryMax": "180000",
    "salaryCurrency": "USD",
    "salaryInterval": "yearly",
    "salarySource": "employer",
    "datePosted": "2026-02-15T00:00:00.000Z",
    "expiresAt": "2026-03-15T00:00:00.000Z",
    "createdAt": "2026-02-15T10:30:00.000Z",
    "updatedAt": "2026-02-16T08:00:00.000Z"
  }
}`}
          />

          {/* GET /companies */}
          <EndpointSection
            method="GET"
            path="/api/v1/companies"
            description="Search companies aggregated from job listings. Returns company info including open job count and salary ranges."
            params={[
              { name: "q", type: "string", required: false, description: "Search company name" },
              { name: "limit", type: "integer", required: false, description: "Results per page (1-50, default: 20)" },
            ]}
            curlExample={`curl "${BASE_URL}/companies?q=google&limit=5" \\
  -H "Authorization: Bearer ej_live_your_api_key_here"`}
            jsExample={`const response = await fetch(
  "${BASE_URL}/companies?" + new URLSearchParams({
    q: "google",
    limit: "5",
  }),
  {
    headers: {
      Authorization: "Bearer ej_live_your_api_key_here",
    },
  }
);

const data = await response.json();
console.log(data.companies); // Array of company objects
console.log(data.total);     // Total matching companies`}
            responseExample={`{
  "companies": [
    {
      "companyName": "Google",
      "companyUrl": "https://google.com",
      "companyLogo": "https://...",
      "companyIndustry": "Technology",
      "companySize": "10001+",
      "companyDescription": "Google LLC is...",
      "jobCount": 87,
      "salaryMin": "95000",
      "salaryMax": "350000"
    }
  ],
  "total": 1
}`}
          />

          {/* GET /salary */}
          <EndpointSection
            method="GET"
            path="/api/v1/salary"
            description="Get salary insights for a job title. Returns statistical breakdown including median, average, percentiles, and per-level analysis. All figures are annualized."
            params={[
              { name: "title", type: "string", required: true, description: "Job title to analyze (e.g., \"Software Engineer\")" },
              { name: "location", type: "string", required: false, description: "Filter by location (city, state, or country)" },
              { name: "level", type: "string", required: false, description: "Filter by job level (e.g., \"senior\", \"junior\")" },
            ]}
            curlExample={`curl "${BASE_URL}/salary?title=Software+Engineer&location=New+York&level=senior" \\
  -H "Authorization: Bearer ej_live_your_api_key_here"`}
            jsExample={`const response = await fetch(
  "${BASE_URL}/salary?" + new URLSearchParams({
    title: "Software Engineer",
    location: "New York",
    level: "senior",
  }),
  {
    headers: {
      Authorization: "Bearer ej_live_your_api_key_here",
    },
  }
);

const data = await response.json();
console.log(data.overall);  // { median, average, min, max, p25, p75 }
console.log(data.byLevel);  // Breakdown per seniority level`}
            responseExample={`{
  "title": "Software Engineer",
  "location": "New York",
  "level": "senior",
  "sampleSize": 156,
  "currency": "USD",
  "overall": {
    "median": 185000,
    "average": 192500,
    "min": 120000,
    "max": 350000,
    "p25": 155000,
    "p75": 225000
  },
  "byLevel": [
    {
      "level": "senior",
      "count": 89,
      "median": 195000,
      "min": 145000,
      "max": 280000
    },
    {
      "level": "lead",
      "count": 34,
      "median": 225000,
      "min": 175000,
      "max": 350000
    }
  ]
}`}
          />

          {/* Footer */}
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Need help? Contact us at{" "}
              <a
                href="mailto:support@everjobs.ai"
                className="text-primary hover:underline"
              >
                support@everjobs.ai
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
