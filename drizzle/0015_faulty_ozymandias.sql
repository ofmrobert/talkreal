ALTER TABLE "feed_posts" ADD COLUMN "challenge_id" uuid;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "prize" integer;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_challenge_id_feed_posts_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_posts_challenge_idx" ON "feed_posts" USING btree ("challenge_id");