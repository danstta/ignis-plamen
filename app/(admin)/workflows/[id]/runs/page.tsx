import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getWorkflow } from "@/lib/workflows/service";
import { listRuns } from "@/lib/workflows/runs-service";
import { RunListItem } from "@/components/workflow/run-list-item";
import { RunsLive } from "@/components/workflow/runs-live";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkflowRunsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workflow = await getWorkflow(id);
  if (!workflow) notFound();
  const runs = await listRuns(id);

  return (
    <div className="mx-auto max-w-3xl">
      <RunsLive />
      <Button
        variant="ghost"
        size="sm"
        className="mb-2 -ml-2"
        render={<Link href={`/workflows/${id}`} />}
      >
        <ArrowLeft className="size-4" /> Back to editor
      </Button>
      <h1 className="text-2xl font-semibold">{workflow.name} — Runs</h1>

      {runs.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No runs yet. Trigger this workflow from its connection webhook.
        </div>
      ) : (
        <div className="mt-6 divide-y rounded-lg border">
          {runs.map((r) => (
            <RunListItem
              key={r.id}
              runId={r.id}
              workflowId={id}
              status={r.status}
              createdAt={r.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
