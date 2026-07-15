CREATE TABLE "workflow_run_logs" (
	"run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"visit" integer DEFAULT 1 NOT NULL,
	"seq" integer NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_logs_run_id_node_id_visit_seq_pk" PRIMARY KEY("run_id","node_id","visit","seq")
);
--> statement-breakpoint
ALTER TABLE "workflow_run_logs" ADD CONSTRAINT "workflow_run_logs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;