CREATE TABLE "approval_gates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "approval_gates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"tool" text NOT NULL,
	"action_id" text NOT NULL,
	"summary" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "evaluations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"job_id" integer NOT NULL,
	"score" integer NOT NULL,
	"score5" real NOT NULL,
	"band" text NOT NULL,
	"job_family" text NOT NULL,
	"archetype" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"dimensions" jsonb NOT NULL,
	"blocks" jsonb NOT NULL,
	"recommendation" text NOT NULL,
	"model_used" text,
	"weights_used" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_user_job_unique" UNIQUE("user_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "pipeline_stage" text DEFAULT 'applied' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "stage_changed_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "follow_up_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "last_follow_up_at" timestamp;--> statement-breakpoint
ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_gates_user_id_idx" ON "approval_gates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "approval_gates_user_status_idx" ON "approval_gates" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "approval_gates_action_idx" ON "approval_gates" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "evaluations_user_id_idx" ON "evaluations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "evaluations_user_band_idx" ON "evaluations" USING btree ("user_id","band");--> statement-breakpoint
CREATE INDEX "evaluations_user_score_idx" ON "evaluations" USING btree ("user_id","score");--> statement-breakpoint
CREATE INDEX "evaluations_job_id_idx" ON "evaluations" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_user_stage_idx" ON "applications" USING btree ("user_id","pipeline_stage");