import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRun } from "@/lib/workflows/runs-service";
import { getWorkflow } from "@/lib/workflows/service";
import { getNodeType } from "@/lib/nodes/registry";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { RunStatusBadge } from "@/components/workflow/run-status-badge";
import { CurateImagesPicker } from "@/components/workflow/curate-images-picker";
import { ManualReviewPicker } from "@/components/workflow/manual-review-picker";
import { Button } from "@/components/ui/button";
import { RunLive } from "./run-live";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  error: "Error",
  waiting: "Waiting",
};

function findRenderUrls(outputs: Record<string, Record<string, unknown>>): string[] {
  const urls: string[] = [];
  for (const out of Object.values(outputs)) {
    // Prefer the full per-page list; fall back to the single-page `renderUrl`.
    const many = out?.renderUrls;
    if (Array.isArray(many)) {
      for (const u of many) if (typeof u === "string" && u) urls.push(u);
      continue;
    }
    const one = out?.renderUrl;
    if (typeof one === "string" && one) urls.push(one);
  }
  return urls;
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
  const renderUrls = findRenderUrls(run.nodeOutputs);

  const waitingCandidates =
    run.status === "waiting" && run.waitingNodeId
      ? ((run.nodeOutputs[run.waitingNodeId]?.candidates ?? []) as {
          url: string;
          attribution?: string;
        }[])
      : [];
  const reviewKind =
    run.status === "waiting" && run.waitingNodeId
      ? run.nodeOutputs[run.waitingNodeId]?.reviewKind
      : undefined;
  const reviewItemLabel = reviewKind === "designs" ? "design" : "image";
  const waitingSelected =
    run.status === "waiting" && run.waitingNodeId
      ? ((run.nodeOutputs[run.waitingNodeId]?.selected ?? []) as {
          url: string;
          attribution?: string;
        }[])
      : [];
  const waitingAlternates =
    run.status === "waiting" && run.waitingNodeId
      ? ((run.nodeOutputs[run.waitingNodeId]?.alternates ?? []) as {
          url: string;
          attribution?: string;
        }[])
      : [];
  const waitingSelectionCount =
    run.status === "waiting" && run.waitingNodeId
      ? Number(run.nodeOutputs[run.waitingNodeId]?.selectionCount ?? 10)
      : 10;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Polls + refreshes this server page while the run is live (execution is async). */}
      <RunLive
        runId={run.id}
        status={run.status}
        updatedAt={run.updatedAt.toISOString()}
      />
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

      {run.status === "waiting" && run.resumeToken && reviewKind === "image-set" ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Curate image set</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            Remove similar images from the selected set, then add replacements from
            alternates.
          </p>
          <CurateImagesPicker
            runId={run.id}
            resumeToken={run.resumeToken}
            selected={waitingSelected}
            alternates={waitingAlternates}
            selectionCount={waitingSelectionCount}
          />
        </section>
      ) : null}

      {run.status === "waiting" && run.resumeToken && reviewKind !== "image-set" ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">
            Pick the final {reviewItemLabel}
          </h2>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            The run is paused. Choose a {reviewItemLabel} to finish it.
          </p>
          <ManualReviewPicker
            runId={run.id}
            resumeToken={run.resumeToken}
            candidates={waitingCandidates}
            itemLabel={reviewItemLabel}
          />
        </section>
      ) : null}

      {renderUrls.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">
            Rendered output{renderUrls.length > 1 ? ` (${renderUrls.length} pages)` : ""}
          </h2>
          <div className="mt-2 flex flex-wrap gap-3">
            {renderUrls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`Rendered page ${i + 1}`}
                className="max-w-sm rounded-lg border"
              />
            ))}
          </div>
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
