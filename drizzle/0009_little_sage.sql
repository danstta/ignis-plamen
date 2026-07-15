ALTER TABLE "folders" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "icon_url" text;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;