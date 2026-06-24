import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRun } from "@/lib/workflows/runs-service";
import { getWorkflow } from "@/lib/workflows/service";
import { getNodeType } from "@/lib/nodes/registry";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { RunStatusBadge } from "@/components/workflow/run-status-badge";
import { ManualReviewPicker } from "@/components/workflow/manual-review-picker";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  error: "Error",
  waiting: "Waiting",
};

function findRenderUrl(outputs: Record<string, Record<string, unknown>>): string | null {
  for (const out of Object.values(outputs)) {
    const url = out?.renderUrl;
    if (typeof url === "string" && url) return url;
  }
  return null;
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const run = await getRun(runId);
  if (!run || run.workflowId !== id) notFound();
  const workflow = await getWorkflow(id);
  if (!workflow) notFound();

  const graph = workflow.graph as WorkflowGraph;
  const renderUrl = findRenderUrl(run.nodeOutputs);

  const waitingCandidates =
    run.status === "waiting" && run.waitingNodeId
      ? ((run.nodeOutputs[run.waitingNodeId]?.candidates ?? []) as {
          url: string;
          attribution?: string;
        }[])
      : [];

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-2 -ml-2"
        render={<Link href={`/workflows/${id}/runs`} />}
      >
        <ArrowLeft className="size-4" /> Back to runs
      </Button>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Run detail</h1>
        <RunStatusBadge status={run.status} />
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{run.id}</p>

      {run.error ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {run.error}
        </div>
      ) : null}

      {run.status === "waiting" && run.resumeToken ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Pick the final image</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            The run is paused. Choose an image to finish it.
          </p>
          <ManualReviewPicker
            runId={run.id}
            resumeToken={run.resumeToken}
            candidates={waitingCandidates}
          />
        </section>
      ) : null}

      {renderUrl ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Rendered output</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={renderUrl}
            alt="Rendered output"
            className="mt-2 max-w-sm rounded-lg border"
          />
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Nodes</h2>
        <div className="mt-2 divide-y rounded-lg border">
          {graph.nodes.map((n) => {
            const def = getNodeType(n.type);
            const state = run.nodeStates[n.id] ?? "pending";
            const outputs = run.nodeOutputs[n.id];
            return (
              <div key={n.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {def?.label ?? n.type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {STATE_LABEL[state] ?? state}
                  </span>
                </div>
                {outputs ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
                    {JSON.stringify(outputs, null, 2)}
                  </pre>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Trigger payload</h2>
        <pre className="mt-2 max-h-60 overflow-auto rounded-lg border bg-muted p-3 text-[11px] leading-relaxed">
          {JSON.stringify(run.trigger, null, 2)}
        </pre>
      </section>
    </div>
  );
}
