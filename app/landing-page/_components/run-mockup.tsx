import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AppFrame } from "./app-frame";
import { LISBON_PAGE_GRADIENTS, PosterBrandRow } from "./poster";

/**
 * The Ignis run-detail page mid-run, reproduced 1:1 from
 * app/(admin)/workflows/[id]/runs/[runId]/*: header with Stop run / Live /
 * status badge, metadata grid, rendered pages, and the per-node disclosure
 * cards with streaming logs (run-node-card.tsx). Nothing is wired up.
 */

type NodeState = "done" | "running";

const STATE_TONE: Record<NodeState, { label: string; className: string }> = {
  done: { label: "Done", className: "text-emerald-600 dark:text-emerald-400" },
  running: { label: "Active", className: "text-sky-600 dark:text-sky-400" },
};

interface LogLine {
  time: string;
  level: "info" | "warn";
  message: string;
}

interface MockNode {
  label: string;
  state: NodeState;
  logCount: number;
  logs?: LogLine[];
  output?: string;
}

const NODES: MockNode[] = [
  { label: "Webhook", state: "done", logCount: 2 },
  { label: "Find Location Images", state: "done", logCount: 6 },
  {
    label: "Rank Images",
    state: "done",
    logCount: 4,
    logs: [
      {
        time: "14:02:11",
        level: "info",
        message: "Ranking 12 candidate images with vision",
      },
      {
        time: "14:02:12",
        level: "info",
        message: "Criteria: golden light, waterfront, recognizable landmarks",
      },
      {
        time: "14:02:18",
        level: "info",
        message:
          "Top pick photo_07 · score 0.94 — “waterfront at dusk, Ponte 25 de Abril in frame”",
      },
      { time: "14:02:18", level: "info", message: "Done in 6.4s" },
    ],
    output: `{
  "best": "https://…/photo_07.jpg",
  "ranked": [
    { "url": "https://…/photo_07.jpg", "score": 0.94 },
    { "url": "https://…/photo_03.jpg", "score": 0.88 },
    { "url": "https://…/photo_11.jpg", "score": 0.81 }
  ]
}`,
  },
  { label: "Curate Images", state: "done", logCount: 3 },
  { label: "Render Template", state: "done", logCount: 3 },
  {
    label: "Upload Drive Files",
    state: "running",
    logCount: 4,
    logs: [
      {
        time: "14:03:02",
        level: "info",
        message: "Connected to Google Drive (OAuth)",
      },
      {
        time: "14:03:04",
        level: "info",
        message: "Uploading lisbon-poster-1.png (1.2 MB)…",
      },
      {
        time: "14:03:05",
        level: "info",
        message: "Uploading lisbon-poster-2.png (1.4 MB)…",
      },
      {
        time: "14:03:06",
        level: "warn",
        message: "Drive quota at 80% — continuing",
      },
    ],
  },
];

/** A rendered page thumbnail (the real page shows the PNG via object-contain). */
function RenderedPage({ index }: { index: number }) {
  return (
    <figure className="min-w-0">
      <div className="flex h-24 w-full items-center justify-center rounded-md border bg-muted/20 sm:h-28">
        <div
          className="flex h-full flex-col justify-between p-1.5"
          style={{
            aspectRatio: "1080 / 1350",
            background: LISBON_PAGE_GRADIENTS[index],
          }}
        >
          <PosterBrandRow />
          <span className="font-display text-[10px] font-bold leading-none text-white">
            Lisbon
          </span>
        </div>
      </div>
      <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">
        Page {index + 1}
      </figcaption>
    </figure>
  );
}

function NodeCard({ node }: { node: MockNode }) {
  const tone = STATE_TONE[node.state];
  const open = Boolean(node.logs);
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left">
        {node.state === "running" ? (
          <LoaderCircle
            className={cn(
              "size-4 shrink-0 animate-spin motion-reduce:animate-none",
              tone.className,
            )}
          />
        ) : (
          <CheckCircle2 className={cn("size-4 shrink-0", tone.className)} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {node.label}
        </span>
        <span className={cn("text-xs", tone.className)}>{tone.label}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
          {node.logCount}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground",
            open && "rotate-180",
          )}
        />
      </div>

      {open ? (
        <div className="border-t">
          <div className="bg-muted/20">
            <ol className="py-1">
              {node.logs?.map((entry, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[4rem_1fr] gap-2 px-3 py-1.5 text-xs"
                >
                  <time className="font-mono text-[11px] text-muted-foreground">
                    {entry.time}
                  </time>
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1 size-1.5 shrink-0 rounded-full",
                          entry.level === "warn"
                            ? "bg-amber-500"
                            : "bg-foreground/35",
                        )}
                      />
                      <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
                        {entry.message}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {node.output ? (
            <div className="border-t">
              <div className="px-3 pt-2 text-[11px] font-medium text-muted-foreground">
                Output
              </div>
              <pre className="max-h-48 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
                {node.output}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RunMockup() {
  return (
    <AppFrame path="/workflows/lisbon-pipeline/runs/a1f3c9d2">
      <div className="mx-auto max-w-3xl p-6">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2">
          <ArrowLeft className="size-4" /> Back to runs
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-semibold">Run detail</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              in{" "}
              <span className="underline-offset-4 hover:text-foreground hover:underline">
                Lisbon Poster Pipeline
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="destructive">
              <Square className="size-3.5" />
              Stop run
            </Button>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              </span>
              Live
            </span>
            <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              Running
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5 bg-card p-3">
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd className="truncate text-sm font-medium">2 minutes ago</dd>
          </div>
          <div className="flex flex-col gap-0.5 bg-card p-3">
            <dt className="text-xs text-muted-foreground">Updated</dt>
            <dd className="truncate text-sm font-medium">12 seconds ago</dd>
          </div>
          <div className="flex flex-col gap-0.5 bg-card p-3">
            <dt className="text-xs text-muted-foreground">Nodes</dt>
            <dd className="text-sm font-medium tabular-nums">6</dd>
          </div>
          <div className="flex flex-col gap-0.5 bg-card p-3">
            <dt className="text-xs text-muted-foreground">Run ID</dt>
            <dd className="truncate font-mono text-xs font-medium">a1f3c9d2</dd>
          </div>
        </dl>

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-semibold">Rendered output (3 pages)</h4>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {[0, 1, 2].map((i) => (
              <RenderedPage key={i} index={i} />
            ))}
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-semibold">Nodes</h4>
            <span className="text-xs text-muted-foreground">6 total</span>
          </div>
          <div className="flex flex-col gap-2">
            {NODES.map((node) => (
              <NodeCard key={node.label} node={node} />
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h4 className="text-sm font-semibold">Trigger payload</h4>
          <div className="mt-2">
            <div className="flex items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground">
              <ChevronDown className="size-3" />
              Show payload
            </div>
          </div>
        </section>
      </div>
    </AppFrame>
  );
}
