import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  agentType: text("agent_type"),
  context: jsonb("context").$type<{
    currentFilters?: Record<string, unknown>;
    activeAgentId?: string;
    onboardingStep?: number;
  }>(),

  status: text("status", {
    enum: ["active", "completed", "archived"],
  })
    .notNull()
    .default("active"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),

  role: text("role", {
    enum: ["user", "assistant", "system", "tool"],
  }).notNull(),

  content: text("content"),
  toolCalls: jsonb("tool_calls"),
  toolResults: jsonb("tool_results"),
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});
