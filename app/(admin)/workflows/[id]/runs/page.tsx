import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getWorkflow } from "@/lib/workflows/service";
import { listRuns } from "@/lib/workflows/runs-service";
import { RunsLiveList } from "@/components/workflow/runs-live-list";
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
      <Button
        variant="ghost"
        size="sm"
        className="mb-2 -ml-2"
        render={<Link href={`/workflows/${id}`} />}
      >
        <ArrowLeft className="size-4" /> Back to editor
      </Button>
      <h1 className="text-2xl font-semibold">{workflow.name} — Runs</h1>

      <RunsLiveList
        className="mt-6"
        workflowId={id}
        initialRuns={runs}
        emptyState={
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No runs yet. Trigger this workflow from its connection webhook.
          </div>
        }
      />
    </div>
  );
}
