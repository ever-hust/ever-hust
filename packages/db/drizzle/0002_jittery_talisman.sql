ALTER TABLE "jobs" ADD COLUMN "liveness" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "legitimacy" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "legitimacy_reasons" jsonb;