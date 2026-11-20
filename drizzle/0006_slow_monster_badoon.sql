ALTER TABLE "review_items" ADD COLUMN "data" jsonb;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "scenario" text;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "lesson_id" text;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "report_status" text DEFAULT 'none' NOT NULL;