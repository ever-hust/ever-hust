import { z } from "zod";

export const SiteEnum = z.enum([
  "linkedin",
  "indeed",
  "glassdoor",
  "ziprecruiter",
  "google",
  "bayt",
  "naukri",
  "bdjobs",
  "internshala",
  "exa",
  "upwork",
]);

export const JobTypeEnum = z.enum([
  "fulltime",
  "parttime",
  "internship",
  "contract",
]);

export const ScraperInputSchema = z.object({
  searchTerm: z.string().optional(),
  location: z.string().optional(),
  distance: z.number().optional().default(50),
  isRemote: z.boolean().optional(),
  jobType: z.array(JobTypeEnum).optional(),
  siteType: z.array(SiteEnum).optional(),
  companySlug: z.string().optional(),
  resultsWanted: z.number().optional().default(15),
  offset: z.number().optional(),
  hoursOld: z.number().optional(),
  country: z.string().optional().default("USA"),
  descriptionFormat: z.enum(["markdown", "html", "plain"]).optional(),
  easyApply: z.boolean().optional(),
  enforceAnnualSalary: z.boolean().optional(),
  linkedinFetchDescription: z.boolean().optional(),
  linkedinCompanyIds: z.array(z.string()).optional(),
});

export type ScraperInput = z.infer<typeof ScraperInputSchema>;

export interface JobPostDto {
  id: string;
  site: string;
  title: string;
  companyName?: string;
  companyUrl?: string;
  companyLogo?: string;
  jobUrl?: string;
  jobUrlDirect?: string;
  applyUrl?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  isRemote?: boolean;
  jobType?: string[];
  compensation?: {
    interval?: string;
    minAmount?: number;
    maxAmount?: number;
    currency?: string;
  };
  description?: string;
  datePosted?: string;
  emails?: string[];
  skills?: string[];
  department?: string;
  team?: string;
  employmentType?: string;
  jobLevel?: string;
  jobFunction?: string;
  companyIndustry?: string;
  companyNumEmployees?: string;
  companyDescription?: string;
}

export interface JobSearchResponse {
  count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  cached: boolean;
  jobs: JobPostDto[];
}
