import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Durable, auditable human-approval gate for any outward action (spec #6). The gate is a
 * server-side state transition (pending → approved/denied/expired) so no prompt instruction
 * can skip it — the structural enforcement of the constitution's Article 4 (human-in-the-loop).
 */
export const approvalGates = pgTable(
  "approval_gates",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The outward-action tool requesting approval (see OUTWARD_ACTION_TOOLS). */
    tool: text("tool").notNull(),
    /** Stable id of the specific action instance (e.g. `apply:<jobId>`). */
    actionId: text("action_id").notNull(),
    /** Human-readable summary of what will happen on approval. */
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    status: text("status", {
      enum: ["pending", "approved", "denied", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: timestamp("expires_at"),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("approval_gates_user_id_idx").on(table.userId),
    index("approval_gates_user_status_idx").on(table.userId, table.status),
    index("approval_gates_action_idx").on(table.actionId),
  ]
);
