import {
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileUp,
  Images,
  LayoutTemplate,
  LoaderCircle,
  MapPin,
  PauseCircle,
  ScanEye,
  Square,
  Webhook,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Static, non-interactive mockup of the Ignis run-detail page. Recreates the
 * live execution view — run header with status/Stop/Live, metadata grid,
 * rendered output, per-node disclosure cards with logs and outputs, and the
 * trigger payload — purely for visual showcase on the landing page. Nothing
 * is interactive; an in-progress run is depicted so the running/waiting states
 * and streaming logs are visible at a glance.
 */

function TrafficLights() {
  return (
    <div className="flex items-center gap-2">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

type NodeState = "pending" | "running" | "done" | "error" | "waiting" | "stopped";

const STATE_TONE: Record<
  NodeState,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  pending: { label: "Pending", icon: Clock3, className: "text-muted-foreground" },
  running: { label: "Active", icon: LoaderCircle, className: "text-sky-600 dark:text-sky-400" },
  done: { label: "Done", icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  error: { label: "Error", icon: CircleAlert, className: "text-destructive" },
  waiting: { label: "Waiting", icon: PauseCircle, className: "text-amber-600 dark:text-amber-400" },
  stopped: { label: "Stopped", icon: Square, className: "text-muted-foreground" },
};

type LogLevel = "info" | "warn" | "error";

interface LogLine {
  time: string;
  level: LogLevel;
  message: string;
}

interface MockNode {
  step: string;
  label: string;
  icon: typeof Webhook;
  state: NodeState;
  logCount: number;
  expanded?: boolean;
  isLlm?: boolean;
  logs?: LogLine[];
  output?: string;
}

const NODES: MockNode[] = [
  {
    step: "S1",
    label: "Webhook",
    icon: Webhook,
    state: "done",
    logCount: 3,
  },
  {
    step: "S2",
    label: "Find Location Images",
    icon: MapPin,
    state: "done",
    logCount: 5,
  },
  {
    step: "S3",
    label: "Rank Images",
    icon: ScanEye,
    state: "done",
    logCount: 8,
    expanded: true,
    isLlm: true,
    logs: [
      { time: "14:02:11", level: "info", message: "Received 12 candidate images from Find Location Images" },
      { time: "14:02:12", level: "info", message: "Sending batch to gpt-4o vision for ranking (criteria: polished travel, wide landscape, vivid color)" },
      { time: "14:02:18", level: "info", message: "Model returned rankings in 4.7s" },
      { time: "14:02:18", level: "info", message: "Top pick: photo_07 — score 0.94 — \u201cvivid waterfront, blue sky, recognizable landmark\u201d" },
    ],
    output: `{
  "best": {
    "url": "https://cdn.ignis.app/ranks/photo_07.jpg",
    "title": "Lisbon waterfront at golden hour",
    "score": 0.94
  },
  "ranked": [
    { "id": "photo_07", "score": 0.94 },
    { "id": "photo_03", "score": 0.88 },
    { "id": "photo_11", "score": 0.81 }
  ]
}`,
  },
  {
    step: "S4",
    label: "Curate Images",
    icon: Images,
    state: "done",
    logCount: 4,
  },
  {
    step: "S5",
    label: "Render Template",
    icon: LayoutTemplate,
    state: "done",
    logCount: 2,
  },
  {
    step: "S6",
    label: "Upload Drive Files",
    icon: FileUp,
    state: "running",
    logCount: 14,
    expanded: true,
    logs: [
      { time: "14:03:02", level: "info", message: "Authenticated to Google Drive via OAuth connection" },
      { time: "14:03:03", level: "warn", message: "Upload quota at 80% — proceeding with this batch" },
      { time: "14:03:04", level: "info", message: "Uploading render_page_1.png (1.2 MB)…" },
      { time: "14:03:05", level: "info", message: "Uploading render_page_2.png (1.4 MB)…" },
      { time: "14:03:06", level: "info", message: "Uploading render_page_3.png (1.1 MB)…" },
    ],
  },
];

function RenderThumb({ index }: { index: number }) {
  const gradients = [
    "from-blue-900 via-red-700 to-amber-400",
    "from-slate-800 via-purple-700 to-rose-400",
    "from-emerald-900 via-teal-700 to-lime-300",
    "from-indigo-900 via-fuchsia-700 to-orange-300",
  ];
  return (
    <figure className="min-w-0">
      <div
        className={cn(
          "h-20 w-full rounded-md border border-border bg-gradient-to-br shadow-sm",
          gradients[index % gradients.length],
        )}
      >
        <div className="flex h-full flex-col justify-between p-1.5">
          <div className="flex items-center gap-1">
            <div className="size-2 rounded-full bg-white/80" />
            <span className="text-[7px] font-semibold text-white/80">BRAND</span>
          </div>
          <span className="text-[8px] font-bold leading-none text-white">
            Page {index + 1}
          </span>
        </div>
      </div>
      <figcaption className="mt-1 truncate text-[10px] text-muted-foreground">
        Page {index + 1}
      </figcaption>
    </figure>
  );
}

function NodeCard({ node }: { node: MockNode }) {
  const tone = STATE_TONE[node.state];
  const StatusIcon = tone.icon;
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5">
        <StatusIcon
          className={cn(
            "size-4 shrink-0",
            tone.className,
            node.state === "running" && "animate-spin",
          )}
        />
        <node.icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {node.label}
        </span>
        <span className={cn("text-xs", tone.className)}>{tone.label}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
          {node.logCount}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            node.expanded && "rotate-180",
          )}
        />
      </div>

      {node.expanded ? (
        <div className="border-t border-border">
          {node.logs && node.logs.length > 0 ? (
            <ol className="bg-muted/20 py-1">
              {node.logs.map((entry, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[3.75rem_1fr] gap-2 px-3 py-1.5 text-[11px]"
                >
                  <time className="font-mono text-[10px] text-muted-foreground">
                    {entry.time}
                  </time>
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1 size-1.5 shrink-0 rounded-full",
                        entry.level === "error"
                          ? "bg-rose-500"
                          : entry.level === "warn"
                            ? "bg-amber-500"
                            : "bg-foreground/35",
                      )}
                    />
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
                      {entry.message}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {node.output ? (
            <div className="border-t border-border">
              <div className="px-3 pt-2 text-[11px] font-medium text-muted-foreground">
                {node.isLlm ? "LLM output" : "Output"}
              </div>
              <pre className="max-h-40 overflow-auto p-3 font-mono text-[10px] leading-relaxed">
                {node.output}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RunDetailMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/20">
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-2.5">
        <TrafficLights />
        <span className="text-xs font-medium text-muted-foreground">
          Ignis — Run Detail
        </span>
      </div>

      {/* Run detail body */}
      <div className="scrollbar-thin-muted max-h-[560px] overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          {/* Back link */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="size-3.5" />
            Back to runs
          </div>

          {/* Header: title + actions */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Run detail</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                in{" "}
                <span className="underline-offset-4 hover:text-foreground hover:underline">
                  Location Poster Generator
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white">
                <Square className="size-3.5" />
                Stop run
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                </span>
                Live
              </span>
              <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                Running
              </span>
            </div>
          </div>

          {/* Metadata grid */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border ring-1 ring-foreground/10 sm:grid-cols-4">
            {[
              { label: "Started", value: "2 minutes ago" },
              { label: "Updated", value: "12 seconds ago" },
              { label: "Nodes", value: "6" },
              { label: "Run ID", value: "a1f3c9d2", mono: true },
            ].map((cell) => (
              <div key={cell.label} className="flex flex-col gap-0.5 bg-card p-2.5">
                <dt className="text-[10px] text-muted-foreground">{cell.label}</dt>
                <dd
                  className={cn(
                    "truncate text-xs font-medium",
                    cell.mono && "font-mono",
                  )}
                >
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Rendered output */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-xs font-semibold">Rendered output (4 pages)</h3>
              <span className="text-[10px] text-muted-foreground">from Render Template</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <RenderThumb key={i} index={i} />
              ))}
            </div>
          </section>

          {/* Nodes */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-xs font-semibold">Nodes</h3>
              <span className="text-[10px] text-muted-foreground">6 total</span>
            </div>
            <div className="flex flex-col gap-2">
              {NODES.map((node) => (
                <NodeCard key={node.step} node={node} />
              ))}
            </div>
          </section>

          {/* Trigger payload (collapsed) */}
          <section>
            <h3 className="text-xs font-semibold">Trigger payload</h3>
            <div className="mt-2 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground">
                <ChevronDown className="size-3" />
                Show payload
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
