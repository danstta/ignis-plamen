import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { getRun } from "@/lib/workflows/runs-service";
import { getWorkflow } from "@/lib/workflows/service";
import { getNodeType } from "@/lib/nodes/registry";
import { formatRelativeTime } from "@/lib/format";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { RunStatusBadge } from "@/components/workflow/run-status-badge";
import { CurateImagesPicker } from "@/components/workflow/curate-images-picker";
import { ManualReviewPicker } from "@/components/workflow/manual-review-picker";
import { Button } from "@/components/ui/button";
import { RunLive } from "./run-live";
import { RunNodeCard } from "./run-node-card";
import { StopRunButton } from "./stop-run-button";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanUrl(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstUrlFromList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const url = cleanUrl(item) ?? (isRecord(item) ? cleanUrl(item.url) : undefined);
    if (url) return url;
  }
  return undefined;
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.filter((url) => url.trim()).map((url) => url.trim()))];
}

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
  return uniqueUrls(urls);
}

function chosenLabel(type: string): string {
  if (type === "review-designs") return "Chosen design";
  if (type === "manual-review") return "Chosen image";
  return "Chosen image";
}

function findChosenImage(
  graph: WorkflowGraph,
  outputs: Record<string, Record<string, unknown>>,
): { url: string; label: string; source: string } | undefined {
  let candidate: { url: string; label: string; source: string } | undefined;

  for (const node of graph.nodes) {
    const out = outputs[node.id];
    if (!out) continue;

    const source = getNodeType(node.type)?.label ?? node.type;
    const chosen =
      cleanUrl(out.chosen) ??
      (isRecord(out.chosenDesign) ? cleanUrl(out.chosenDesign.url) : undefined);
    if (chosen) {
      candidate = { url: chosen, label: chosenLabel(node.type), source };
      continue;
    }

    const best = cleanUrl(out.best);
    if (best) {
      candidate = { url: best, label: "Best image", source };
      continue;
    }

    const selected = firstUrlFromList(out.selectedUrls) ?? firstUrlFromList(out.selected);
    if (selected) {
      candidate = { url: selected, label: "Top selected image", source };
    }
  }

  return candidate;
}

function JsonDisclosure({
  title,
  children,
  className,
}: {
  title: string;
  children: string;
  className?: string;
}) {
  return (
    <details className={className}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
        {title}
      </summary>
      <pre className="max-h-48 overflow-auto border-y bg-muted/45 p-2 text-[11px] leading-relaxed">
        {children}
      </pre>
    </details>
  );
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
  const chosenImage = findChosenImage(graph, run.nodeOutputs);
  const renderedItems = renderUrls.map((url, index) => ({
    url,
    label: `Page ${index + 1}`,
  }));
  const renderedGridItems = chosenImage
    ? renderedItems.filter((item) => item.url !== chosenImage.url)
    : renderedItems;

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
  const previewTemplateId =
    run.status === "waiting" && run.waitingNodeId
      ? String(run.nodeOutputs[run.waitingNodeId]?.previewTemplateId ?? "")
      : "";
  const previewPlaceholders =
    run.status === "waiting" && run.waitingNodeId
      ? ((run.nodeOutputs[run.waitingNodeId]?.previewPlaceholders ?? []) as {
          key: string;
          kind: "text" | "image";
        }[])
      : [];
  const previewBindings =
    run.status === "waiting" && run.waitingNodeId
      ? ((run.nodeOutputs[run.waitingNodeId]?.previewBindings ?? {}) as Record<
          string,
          unknown
        >)
      : {};
  const instagramPreview =
    run.status === "waiting" && run.waitingNodeId
      ? ((run.nodeOutputs[run.waitingNodeId]?.instagramPreview ?? {}) as {
          enabled?: boolean;
          username?: string;
        })
      : undefined;

  return (
    <div className="mx-auto max-w-4xl">
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Run detail</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            in{" "}
            <Link
              href={`/workflows/${id}`}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {workflow.name}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {run.status === "running" || run.status === "waiting" ? (
            <StopRunButton runId={run.id} />
          ) : null}
          {run.status === "running" || run.status === "waiting" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              </span>
              Live
            </span>
          ) : null}
          <RunStatusBadge status={run.status} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5 bg-card p-3">
          <dt className="text-xs text-muted-foreground">Started</dt>
          <dd
            className="truncate text-sm font-medium"
            title={run.createdAt.toLocaleString()}
          >
            {formatRelativeTime(run.createdAt)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 bg-card p-3">
          <dt className="text-xs text-muted-foreground">Updated</dt>
          <dd
            className="truncate text-sm font-medium"
            title={run.updatedAt.toLocaleString()}
          >
            {formatRelativeTime(run.updatedAt)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 bg-card p-3">
          <dt className="text-xs text-muted-foreground">Nodes</dt>
          <dd className="text-sm font-medium tabular-nums">
            {graph.nodes.length}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 bg-card p-3">
          <dt className="text-xs text-muted-foreground">Run ID</dt>
          <dd
            className="truncate font-mono text-xs font-medium"
            title={run.id}
          >
            {run.id}
          </dd>
        </div>
      </dl>

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
            previewTemplateId={previewTemplateId}
            previewPlaceholders={previewPlaceholders}
            previewBindings={previewBindings}
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
            instagramPreview={instagramPreview}
          />
        </section>
      ) : null}

      {chosenImage ? (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{chosenImage.label}</h2>
            <span className="text-xs text-muted-foreground">{chosenImage.source}</span>
          </div>
          <a
            href={chosenImage.url}
            target="_blank"
            rel="noreferrer"
            className="block w-fit outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chosenImage.url}
              alt={`${chosenImage.label} from ${chosenImage.source}`}
              className="max-h-44 w-auto max-w-full rounded-md border bg-muted/20 object-contain"
            />
          </a>
        </section>
      ) : null}

      {renderedGridItems.length > 0 ? (
        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">
              Rendered output
              {renderUrls.length > 1 ? ` (${renderUrls.length} pages)` : ""}
            </h2>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {renderedGridItems.map((item) => (
              <figure key={item.url} className="min-w-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={`Rendered output ${item.label}`}
                    className="h-24 w-full rounded-md border bg-muted/20 object-contain sm:h-28"
                  />
                </a>
                <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">
                  {item.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-7">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Nodes</h2>
          <span className="text-xs text-muted-foreground">
            {graph.nodes.length} total
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {graph.nodes.map((n) => {
            const def = getNodeType(n.type);
            const state = run.nodeStates[n.id] ?? "pending";
            const outputs = run.nodeOutputs[n.id];
            const logs = run.nodeLogs?.[n.id] ?? [];
            return (
              <RunNodeCard
                key={n.id}
                nodeLabel={def?.label ?? n.type}
                state={state}
                logs={logs}
                isLlmNode={n.type === "llm-prompt"}
                outputs={outputs}
              />
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Trigger payload</h2>
        <JsonDisclosure title="Show payload" className="group mt-2">
          {JSON.stringify(run.trigger, null, 2)}
        </JsonDisclosure>
      </section>
    </div>
  );
}
