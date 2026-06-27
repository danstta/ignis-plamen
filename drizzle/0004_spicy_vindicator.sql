ALTER TABLE "bindings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "bindings" CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_trigger_connection_id_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "workflows" DROP COLUMN "trigger_connection_id";