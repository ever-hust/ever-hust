import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";

/**
 * Per-(user, job) job-fit evaluation (spec #3). Mirrors the `evaluation` machine summary
 * (spec #5) so AI verdicts become queryable history — the precondition for funnel
 * analytics (#8) and the learning loop (#13).
 *
 * The jsonb shapes below mirror `@ever-hust/ai` `EvaluationDimension` / `EvaluationBlocks`.
 * `@ever-hust/db` MUST NOT import `@ever-hust/ai` (that would be circular — ai depends on
 * db). The Zod schemas in `@ever-hust/ai/structured` are the runtime gate; these types are
 * for DX only. Keep them in sync.
 */
export interface EvaluationDimensionRow {
  key: string;
  weight: number;
  score5: number;
  rationale: string;
  source: "deterministic" | "llm";
}

export interface EvaluationBlocksRow {
  roleSummary: string;
  cvMatch: {
    evidence: { requirement: string; cvEvidence: string; met: boolean }[];
    gaps: string[];
  };
  levelStrategy: string;
  compDemand: {
    summary: string;
    budgetFit: "good_fit" | "under_budget" | "over_budget" | "unknown";
  };
  customization: string;
  interviewPlan?: { theme: string; starSeed: string }[];
}

export const evaluations = pgTable(
  "evaluations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    // Denormalized, queryable headline fields (mirror the machine summary).
    score: integer("score").notNull(), // 0–100
    score5: real("score5").notNull(), // 1–5 mirror
    band: text("band", {
      enum: ["apply_now", "worth_it", "specific_reason", "not_recommended"],
    }).notNull(),
    jobFamily: text("job_family").notNull(),
    archetype: text("archetype").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),

    // Full machine-summary payloads (spec #5).
    dimensions: jsonb("dimensions").$type<EvaluationDimensionRow[]>().notNull(),
    blocks: jsonb("blocks").$type<EvaluationBlocksRow>().notNull(),
    recommendation: text("recommendation").notNull(),

    // Provenance.
    modelUsed: text("model_used"),
    weightsUsed: jsonb("weights_used").$type<Record<string, number>>(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("evaluations_user_job_unique").on(table.userId, table.jobId),
    index("evaluations_user_id_idx").on(table.userId),
    index("evaluations_user_band_idx").on(table.userId, table.band),
    index("evaluations_user_score_idx").on(table.userId, table.score),
    index("evaluations_job_id_idx").on(table.jobId),
  ]
);
