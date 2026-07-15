CREATE INDEX "folders_kind_name_idx" ON "folders" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "templates_folder_id_idx" ON "templates" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "workflows_folder_id_idx" ON "workflows" USING btree ("folder_id");