ALTER TABLE "user_pii" ADD COLUMN "hidden_by_admin_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "feed_banned_at" timestamp with time zone;