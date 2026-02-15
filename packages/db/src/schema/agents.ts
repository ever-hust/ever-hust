import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";
import { chatSessions } from "./chat";

export const agentInstances = pgTable("agent_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  agentType: text("agent_type").notNull(),

  jobId: integer("job_id").references(() => jobs.id, {
    onDelete: "set null",
  }),
  sessionId: uuid("session_id").references(() => chatSessions.id, {
    onDelete: "set null",
  }),

  status: text("status", {
    enum: ["idle", "running", "waiting_input", "completed", "failed"],
  })
    .notNull()
    .default("idle"),

  state: jsonb("state"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
