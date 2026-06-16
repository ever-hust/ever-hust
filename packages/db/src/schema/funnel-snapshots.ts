import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Point-in-time funnel snapshots (spec #8 — persisted analytics). A scheduled task computes each
 * user's funnel (`computeFunnel` over their applications + evaluation scores) and writes a row, so
 * conversion rates and the score-vs-outcome signal become a time series — the precondition for
 * trend views and the (opt-in) auto-tune the spec leaves as a follow-up.
 *
 * The full `Funnel` shape is stored in `byStage` / `conversions` jsonb; `total` + `avgScore` are
 * denormalised for cheap charting. Mirrors `@ever-hust/ai` `Funnel` (db must NOT import ai).
 */
export const funnelSnapshots = pgTable(
  "funnel_snapshots",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at").notNull().defaultNow(),
    total: integer("total").notNull(),
    byStage: jsonb("by_stage").$type<Record<string, number>>().notNull(),
    conversions: jsonb("conversions")
      .$type<{
        appliedToScreening: number | null;
        screeningToInterview: number | null;
        interviewToOffer: number | null;
        overallOfferRate: number | null;
      }>()
      .notNull(),
    avgScore: integer("avg_score"),
    // How the snapshot was produced (e.g. "scheduled"); leaves room for on-demand captures.
    source: text("source").notNull().default("scheduled"),
  },
  (table) => [index("funnel_snapshots_user_captured_idx").on(table.userId, table.capturedAt.desc())],
);
