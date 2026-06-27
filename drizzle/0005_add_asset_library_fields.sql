ALTER TABLE "assets" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "bytes" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;