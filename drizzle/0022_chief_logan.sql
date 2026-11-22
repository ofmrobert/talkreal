CREATE TABLE "dm_media" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"checked_by_ai" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "seconds" integer;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "waveform" text;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "dm_media" ADD CONSTRAINT "dm_media_message_id_dm_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."dm_messages"("id") ON DELETE cascade ON UPDATE no action;