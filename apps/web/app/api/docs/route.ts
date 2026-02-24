import { NextResponse } from "next/server";

/**
 * GET /api/docs
 *
 * Serves Swagger/OpenAPI documentation via Scalar UI.
 * The actual OpenAPI spec is produced by swagger-jsdoc from JSDoc annotations
 * on route handlers. For now we serve a hand-maintained spec.
 */

const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Hust API",
    version: "1.0.0",
    description:
      "Ever Hust — AI-powered job search platform. Endpoints for jobs, users, chat, and more.",
    contact: {
      name: "Ever Hust Team",
      url: "https://everjobs.ai",
    },
  },
  servers: [
    {
      url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:8443",
      description: "Current environment",
    },
  ],
  paths: {
    "/api/jobs/search": {
      get: {
        summary: "Search jobs",
        description:
          "Full-text search with filters for location, job type, salary range, remote, etc.",
        tags: ["Jobs"],
        parameters: [
          { name: "keywords", in: "query", schema: { type: "string" } },
          { name: "location", in: "query", schema: { type: "string" } },
          { name: "isRemote", in: "query", schema: { type: "boolean" } },
          { name: "jobType", in: "query", schema: { type: "string" } },
          { name: "salaryMin", in: "query", schema: { type: "number" } },
          { name: "salaryMax", in: "query", schema: { type: "number" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 25 } },
        ],
        responses: {
          "200": {
            description: "Paginated list of matching jobs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        jobs: { type: "array", items: { $ref: "#/components/schemas/Job" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        limit: { type: "integer" },
                        hasMore: { type: "boolean" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{id}": {
      get: {
        summary: "Get job by ID",
        tags: ["Jobs"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "Job details" },
          "404": { description: "Job not found" },
        },
      },
    },
    "/api/user/favorites": {
      get: {
        summary: "List user favorites",
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of favorited job IDs" },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        summary: "Toggle job favorite",
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { jobId: { type: "integer" } },
                required: ["jobId"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Favorite toggled" },
        },
      },
    },
    "/api/user/alerts": {
      get: {
        summary: "List user alerts",
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "List of job alerts" } },
      },
      post: {
        summary: "Create job alert",
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Alert created" } },
      },
    },
    "/api/user/hidden-jobs": {
      post: {
        summary: "Hide a job for the current user",
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { jobId: { type: "integer" } },
                required: ["jobId"],
              },
            },
          },
        },
        responses: { "200": { description: "Job hidden" } },
      },
      delete: {
        summary: "Unhide a job",
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Job unhidden" } },
      },
    },
    "/api/ai/chat": {
      post: {
        summary: "AI chat completion",
        tags: ["AI"],
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Streaming chat response" } },
      },
    },
    "/api/admin/geocode": {
      post: {
        summary: "Re-geocode jobs without coordinates",
        tags: ["Admin"],
        responses: {
          "200": { description: "Geocoding results" },
        },
      },
    },
  },
  components: {
    schemas: {
      Job: {
        type: "object",
        properties: {
          id: { type: "integer" },
          externalId: { type: "string" },
          title: { type: "string" },
          companyName: { type: "string", nullable: true },
          companyLogo: { type: "string", nullable: true },
          locationCity: { type: "string", nullable: true },
          locationState: { type: "string", nullable: true },
          locationCountry: { type: "string", nullable: true },
          isRemote: { type: "boolean" },
          jobType: { type: "array", items: { type: "string" } },
          salaryMin: { type: "string", nullable: true },
          salaryMax: { type: "string", nullable: true },
          salaryCurrency: { type: "string", nullable: true },
          salaryInterval: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          skills: { type: "array", items: { type: "string" } },
          latitude: { type: "string", nullable: true },
          longitude: { type: "string", nullable: true },
          datePosted: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: { "Content-Type": "application/json" },
  });
}
