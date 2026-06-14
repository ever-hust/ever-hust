import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";
import { agentInstances } from "./agents";

export const applications = pgTable(
  "applications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    agentInstanceId: uuid("agent_instance_id").references(
      () => agentInstances.id,
      { onDelete: "set null" }
    ),

    status: text("status", {
      enum: ["pending", "in_progress", "submitted", "failed"],
    })
      .notNull()
      .default("pending"),

    externalApiResponse: jsonb("external_api_response"),
    questionsAsked: jsonb("questions_asked"),
    answersProvided: jsonb("answers_provided"),
    coverLetter: text("cover_letter"),

    // Pipeline / Kanban (spec #2) — the user's tracking stage, distinct from the
    // apply-action `status` above. Additive; defaults so existing rows stay valid.
    pipelineStage: text("pipeline_stage", {
      enum: [
        "saved",
        "applied",
        "screening",
        "interviewing",
        "offer",
        "rejected",
        "withdrawn",
      ],
    })
      .notNull()
      .default("applied"),
    stageChangedAt: timestamp("stage_changed_at").notNull().defaultNow(),
    sortOrder: integer("sort_order").notNull().default(0),

    // Follow-up cadence (spec #9) — capped nudging. Additive.
    followUpCount: integer("follow_up_count").notNull().default(0),
    lastFollowUpAt: timestamp("last_follow_up_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("applications_user_id_idx").on(table.userId),
    index("applications_user_job_idx").on(table.userId, table.jobId),
    index("applications_user_status_idx").on(table.userId, table.status),
    index("applications_user_stage_idx").on(table.userId, table.pipelineStage),
    index("applications_job_id_idx").on(table.jobId),
  ]
);
