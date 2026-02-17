import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";

export const jobs = pgTable(
  "jobs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    externalId: text("external_id").notNull().unique(),

    // Source
    site: text("site").notNull(),
    title: text("title").notNull(),

    // Company
    companyName: text("company_name"),
    companyUrl: text("company_url"),
    companyLogo: text("company_logo"),
    companyIndustry: text("company_industry"),
    companyNumEmployees: text("company_num_employees"),
    companyDescription: text("company_description"),

    // URLs
    jobUrl: text("job_url"),
    jobUrlDirect: text("job_url_direct"),
    applyUrl: text("apply_url"),

    // Location
    locationCity: text("location_city"),
    locationState: text("location_state"),
    locationCountry: text("location_country"),
    isRemote: boolean("is_remote").default(false),

    // Job details
    jobType: jsonb("job_type").$type<string[]>().default([]),
    description: text("description"),
    skills: jsonb("skills").$type<string[]>().default([]),
    department: text("department"),
    team: text("team"),
    employmentType: text("employment_type"),
    jobLevel: text("job_level"),
    jobFunction: text("job_function"),

    // Compensation
    salaryMin: numeric("salary_min"),
    salaryMax: numeric("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryInterval: text("salary_interval"),
    salarySource: text("salary_source"),

    // Dates
    datePosted: timestamp("date_posted"),
    expiresAt: timestamp("expires_at"),

    // Raw API response
    rawData: jsonb("raw_data"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("jobs_location_country_idx").on(table.locationCountry),
    index("jobs_is_remote_idx").on(table.isRemote),
    index("jobs_date_posted_idx").on(table.datePosted),
    index("jobs_site_idx").on(table.site),
    index("jobs_title_idx").on(table.title),
    index("jobs_company_name_idx").on(table.companyName),
    index("jobs_job_level_idx").on(table.jobLevel),
    index("jobs_salary_min_idx").on(table.salaryMin),
  ]
);
