CREATE TABLE "funnel_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "funnel_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"total" integer NOT NULL,
	"by_stage" jsonb NOT NULL,
	"conversions" jsonb NOT NULL,
	"avg_score" integer,
	"source" text DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_follow_up_nudge_at" timestamp;--> statement-breakpoint
ALTER TABLE "funnel_snapshots" ADD CONSTRAINT "funnel_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funnel_snapshots_user_captured_idx" ON "funnel_snapshots" USING btree ("user_id","captured_at" DESC NULLS LAST);