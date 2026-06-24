import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getWorkflow } from "@/lib/workflows/service";
import { listRuns } from "@/lib/workflows/runs-service";
import { RunStatusBadge } from "@/components/workflow/run-status-badge";
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

      {runs.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No runs yet. Trigger this workflow from its connection webhook.
        </div>
      ) : (
        <div className="mt-6 divide-y rounded-lg border">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/workflows/${id}/runs/${r.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {r.id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
              <RunStatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
