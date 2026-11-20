CREATE TABLE "daily_quests" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"quests" jsonb NOT NULL,
	"claimed" jsonb NOT NULL,
	"bonus_xp" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_quests_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"user_id" uuid NOT NULL,
	"week" date NOT NULL,
	"tier" integer NOT NULL,
	"group_no" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_members_user_id_week_pk" PRIMARY KEY("user_id","week")
);
--> statement-breakpoint
ALTER TABLE "daily_usage" ADD COLUMN "reviews_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_usage" ADD COLUMN "good_lessons" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_quests" ADD CONSTRAINT "daily_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_group_idx" ON "league_members" USING btree ("week","tier","group_no");