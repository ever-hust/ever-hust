import type { ScraperInput, JobSearchResponse } from "./types";

export type { ScraperInput, JobPostDto, JobSearchResponse } from "./types";

const API_URL = process.env.EVER_JOBS_API_URL ?? "https://api.everjobs.ai";
const API_KEY = process.env.EVER_JOBS_API_KEY;

export class EverJobsClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl ?? API_URL;
    this.apiKey = apiKey ?? API_KEY;
  }

  async searchJobs(
    input: ScraperInput,
    options?: { page?: number; pageSize?: number }
  ): Promise<JobSearchResponse> {
    const params = new URLSearchParams({
      paginate: "true",
      page: String(options?.page ?? 1),
      page_size: String(options?.pageSize ?? 25),
    });

    const response = await fetch(
      `${this.baseUrl}/api/jobs/search?${params}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
        },
        body: JSON.stringify(input),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Ever Jobs API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<JobSearchResponse>;
  }

  async analyzeJobs(input: ScraperInput): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/jobs/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(
        `Ever Jobs API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }
}

export const everJobsClient = new EverJobsClient();
