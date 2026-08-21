CREATE TABLE "plcs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status_topic" text NOT NULL,
	"cmd_topic" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lamps" ADD COLUMN "plc_id" integer;--> statement-breakpoint
ALTER TABLE "lamps" ADD CONSTRAINT "lamps_plc_id_plcs_id_fk" FOREIGN KEY ("plc_id") REFERENCES "public"."plcs"("id") ON DELETE no action ON UPDATE no action;