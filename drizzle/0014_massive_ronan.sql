CREATE TABLE "feed_post_reports" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "feed_post_reports_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "author_id" uuid;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "reports" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_post_reports" ADD CONSTRAINT "feed_post_reports_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_reports" ADD CONSTRAINT "feed_post_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;