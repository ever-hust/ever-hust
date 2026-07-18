/**
 * OpenAPI 3.1 spec for the public Hust Jobs API (`/api/v1/*`). Served as JSON at
 * `/api/openapi.json` and rendered by Scalar (`/api/docs`) and Swagger UI
 * (`/api/swg`). Keep in sync with the route handlers under app/api/v1.
 */
export function buildOpenApiSpec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Hust Jobs API",
      version: "1.0.0",
      description:
        "Public REST API for searching jobs, companies and salary insights on Hust. " +
        "Authenticate with a personal API key: `Authorization: Bearer ej_live_…` " +
        "(create one in Settings → Developer). Session cookies also work when called from the app.",
      contact: { name: "Hust", url: "https://docs.hust.so" },
    },
    servers: [{ url: origin, description: "Hust" }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Jobs", description: "Search and fetch job listings." },
      { name: "Companies", description: "Search hiring companies." },
      { name: "Salary", description: "Salary insights." },
    ],
    paths: {
      "/api/v1/jobs": {
        get: {
          tags: ["Jobs"],
          summary: "Search jobs",
          operationId: "searchJobs",
          parameters: [
            { name: "q", in: "query", description: "Keyword (title/description).", schema: { type: "string", maxLength: 500 } },
            { name: "location", in: "query", description: "City, state, or country.", schema: { type: "string", maxLength: 200 } },
            { name: "remote", in: "query", description: "Remote-only.", schema: { type: "boolean" } },
            { name: "salaryMin", in: "query", schema: { type: "integer", minimum: 0, maximum: 10_000_000 } },
            { name: "salaryMax", in: "query", schema: { type: "integer", minimum: 0, maximum: 10_000_000 } },
            { name: "skills", in: "query", description: "Comma-separated skills.", schema: { type: "string", maxLength: 500 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, maximum: 10_000, default: 0 } },
          ],
          responses: {
            "200": { description: "Matching jobs", content: { "application/json": { schema: { $ref: "#/components/schemas/JobList" } } } },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      "/api/v1/jobs/{jobId}": {
        get: {
          tags: ["Jobs"],
          summary: "Get a job by id",
          operationId: "getJob",
          parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "The job", content: { "application/json": { schema: { type: "object" } } } },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/v1/companies": {
        get: {
          tags: ["Companies"],
          summary: "Search companies",
          operationId: "searchCompanies",
          parameters: [
            { name: "q", in: "query", description: "Company name.", schema: { type: "string", maxLength: 200 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          ],
          responses: {
            "200": { description: "Matching companies", content: { "application/json": { schema: { type: "object" } } } },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/v1/salary": {
        get: {
          tags: ["Salary"],
          summary: "Salary insights",
          operationId: "salaryInsights",
          parameters: [
            { name: "title", in: "query", description: "Job title.", schema: { type: "string" } },
            { name: "location", in: "query", schema: { type: "string" } },
            { name: "level", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Salary distribution", content: { "application/json": { schema: { type: "object" } } } },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "ej_live_…",
          description: "Personal API key from Settings → Developer.",
        },
      },
      responses: {
        Unauthorized: { description: "Missing or invalid API key." },
        RateLimited: { description: "Too many requests — see Retry-After." },
      },
      schemas: {
        Job: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            companyName: { type: "string", nullable: true },
            locationCity: { type: "string", nullable: true },
            locationState: { type: "string", nullable: true },
            locationCountry: { type: "string", nullable: true },
            isRemote: { type: "boolean", nullable: true },
            salaryMin: { type: "string", nullable: true },
            salaryMax: { type: "string", nullable: true },
            jobUrl: { type: "string", nullable: true },
            datePosted: { type: "string", format: "date-time", nullable: true },
          },
        },
        JobList: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                jobs: { type: "array", items: { $ref: "#/components/schemas/Job" } },
                total: { type: "integer" },
                limit: { type: "integer" },
                offset: { type: "integer" },
              },
            },
          },
        },
      },
    },
  };
}
