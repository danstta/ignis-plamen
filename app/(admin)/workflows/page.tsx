import Link from "next/link";
import { Workflow as WorkflowIcon, Plus } from "lucide-react";
import { listWorkflows } from "@/lib/workflows/service";
import { WorkflowCard } from "@/components/workflow/workflow-card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  let rows: Awaited<ReturnType<typeof listWorkflows>> = [];
  let dbError: string | null = null;
  try {
    rows = await listWorkflows();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-5" />
            <h1 className="text-2xl font-semibold">Workflows</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Visual automations that run when a connection&apos;s webhook fires.
          </p>
        </div>
        <Button render={<Link href="/workflows/new" />}>
          <Plus className="size-4" /> New workflow
        </Button>
      </div>

      {dbError ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>bun run db:migrate</code>.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No workflows yet. Create one to get started.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rows.map((w) => (
            <WorkflowCard
              key={w.id}
              id={w.id}
              name={w.name}
              active={w.active}
              updated={new Date(w.updatedAt).toLocaleString()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
