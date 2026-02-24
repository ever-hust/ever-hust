import {
  pgTable,
  text,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";

export const userJobs = pgTable(
  "user_jobs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    status: text("status", {
      enum: ["viewed", "applied", "favorited", "rejected", "hidden"],
    }).notNull(),

    appliedAt: timestamp("applied_at"),
    coverLetter: text("cover_letter"),
    notes: text("notes"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("user_jobs_unique").on(table.userId, table.jobId),
    index("user_jobs_user_id_idx").on(table.userId),
    index("user_jobs_status_idx").on(table.userId, table.status),
  ]
);
