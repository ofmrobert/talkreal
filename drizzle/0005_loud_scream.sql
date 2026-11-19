CREATE TABLE "review_items" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"lesson_id" text NOT NULL,
	"box" integer DEFAULT 0 NOT NULL,
	"due_day" date NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_items_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_items_due_idx" ON "review_items" USING btree ("user_id","due_day");