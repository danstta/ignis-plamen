CREATE INDEX "webhook_events_workflow_node_created_at_idx" ON "webhook_events" USING btree ("workflow_id","node_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_id_created_at_idx" ON "workflow_runs" USING btree ("workflow_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "workflow_runs_created_at_idx" ON "workflow_runs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");