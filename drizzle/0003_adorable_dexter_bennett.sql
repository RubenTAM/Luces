CREATE TABLE "lamp_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"lamp_id" integer,
	"lamp_name" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lamp_events" ADD CONSTRAINT "lamp_events_lamp_id_lamps_id_fk" FOREIGN KEY ("lamp_id") REFERENCES "public"."lamps"("id") ON DELETE set null ON UPDATE no action;