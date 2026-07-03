import {
  Plus,
  Webhook,
  MapPin,
  ScanEye,
  Images,
  LayoutTemplate,
  FlaskConical,
  ListChecks,
  Save,
  FileUp,
  Sparkles,
  Type as TypeIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Static, non-interactive mockup of the Ignis workflow editor. Recreates the
 * three-panel layout (node palette, canvas with connected nodes, config panel)
 * purely for visual showcase on the landing page. No buttons do anything.
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

const PALETTE_GROUPS: {
  label: string;
  count: number;
  items: { label: string; desc: string }[];
}[] = [
  {
    label: "Trigger",
    count: 1,
    items: [
      { label: "Webhook", desc: "Starts from an inbound HTTP webhook" },
    ],
  },
  {
    label: "Media",
    count: 3,
    items: [
      { label: "Find Location Images", desc: "Searches free image sources near a location" },
      { label: "Curate Images", desc: "Swap ranked images with alternates" },
      { label: "Rehost Image", desc: "Copies an image into permanent storage" },
    ],
  },
  {
    label: "AI",
    count: 2,
    items: [
      { label: "Rank Images", desc: "Ranks photos with GPT vision" },
      { label: "LLM Prompt", desc: "Calls an AI model with a custom prompt" },
    ],
  },
  {
    label: "Design",
    count: 3,
    items: [
      { label: "Render Template", desc: "Fills placeholders and renders a PNG" },
      { label: "Render Template Batch", desc: "Renders several versions at once" },
      { label: "Review Designs", desc: "Pause and pick a generated design" },
    ],
  },
  {
    label: "Flow",
    count: 2,
    items: [
      { label: "Manual Review", desc: "Pauses for a human to pick" },
      { label: "Router", desc: "Routes down conditional branches" },
    ],
  },
];

function PaletteItem({
  label,
  desc,
  highlight,
}: {
  label: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-9 w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left",
        highlight
          ? "border-foreground/15 bg-accent/70"
          : "bg-muted/25",
      )}
    >
      <Plus className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium leading-4">
          {label}
        </span>
        <span className="block truncate text-[10px] leading-4 text-muted-foreground">
          {desc}
        </span>
      </span>
    </div>
  );
}

function PaletteGroup({
  label,
  count,
  items,
}: {
  label: string;
  count: number;
  items: { label: string; desc: string }[];
}) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-[9px] tabular-nums text-muted-foreground/70">
          {count}
        </span>
      </div>
      {items.map((item) => (
        <PaletteItem key={item.label} {...item} />
      ))}
    </section>
  );
}

/** A workflow node card matching the real WorkflowNode styling. */
function WfNode({
  step,
  label,
  isTrigger,
  isSelected,
  icon,
}: {
  step: string;
  label: string;
  isTrigger?: boolean;
  isSelected?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-52 items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 shadow-sm",
        isSelected
          ? "border-foreground/40 ring-1 ring-foreground/20"
          : "border-border",
      )}
    >
      <span
        className={cn(
          "flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums",
          isTrigger
            ? "bg-amber-500/15 text-amber-600"
            : "bg-muted text-muted-foreground",
        )}
      >
        {step}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium">{label}</span>
          {isTrigger ? (
            <span className="block text-[10px] text-muted-foreground">
              Trigger
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The vertical connector between nodes. */
function NodeConnector() {
  return (
    <div className="ml-[calc(2rem-0.5px)] h-4 w-px bg-border" />
  );
}

function ConfigField({
  label,
  value,
  type = "input",
}: {
  label: string;
  value: string;
  type?: "input" | "select" | "textarea";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {type === "textarea" ? (
        <div className="rounded-md border border-border bg-background p-2 text-[11px] leading-relaxed text-muted-foreground">
          {value}
        </div>
      ) : (
        <div className="flex h-7 items-center justify-between rounded-md border border-border bg-background px-2 text-[11px]">
          <span className="truncate">{value}</span>
          {type === "select" ? (
            <span className="text-muted-foreground/60">⌄</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function WorkflowMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/20">
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-2.5">
        <TrafficLights />
        <span className="text-xs font-medium text-muted-foreground">
          Ignis — Workflow Editor
        </span>
      </div>

      {/* Editor body — three panels */}
      <div className="flex h-[460px]">
        {/* Node palette (left) */}
        <aside className="w-48 shrink-0 overflow-hidden border-r border-border bg-sidebar p-2.5">
          <div className="flex flex-col gap-2.5">
            {PALETTE_GROUPS.map((group) => (
              <PaletteGroup key={group.label} {...group} />
            ))}
          </div>
        </aside>

        {/* Canvas (center) */}
        <div className="relative min-w-0 flex-1 bg-muted/30">
          {/* Dotted background */}
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "radial-gradient(circle, var(--border) 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />

          {/* Nodes */}
          <div className="relative flex h-full flex-col items-center justify-center gap-0 py-4">
            <WfNode
              step="S1"
              label="Webhook"
              isTrigger
              icon={<Webhook className="size-3.5 shrink-0 text-muted-foreground" />}
            />
            <NodeConnector />
            <WfNode
              step="S2"
              label="Find Location Images"
              icon={<MapPin className="size-3.5 shrink-0 text-muted-foreground" />}
            />
            <NodeConnector />
            <WfNode
              step="S3"
              label="Rank Images"
              icon={<ScanEye className="size-3.5 shrink-0 text-muted-foreground" />}
            />
            <NodeConnector />
            <WfNode
              step="S4"
              label="Curate Images"
              icon={<Images className="size-3.5 shrink-0 text-muted-foreground" />}
            />
            <NodeConnector />
            <WfNode
              step="S5"
              label="Render Template"
              isSelected
              icon={<LayoutTemplate className="size-3.5 shrink-0 text-muted-foreground" />}
            />
            <NodeConnector />
            <WfNode
              step="S6"
              label="Upload Drive Files"
              icon={<FileUp className="size-3.5 shrink-0 text-muted-foreground" />}
            />
          </div>
        </div>

        {/* Config panel (right) */}
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-background">
          {/* Panel header */}
          <div className="shrink-0 border-b border-border bg-background/95 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium">
                Location Poster Generator
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex h-4 w-7 items-center rounded-full bg-foreground p-0.5">
                  <div className="ml-auto size-3 rounded-full bg-background" />
                </div>
                <span className="text-[10px] text-muted-foreground">Active</span>
              </div>
              <div className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground">
                <FlaskConical className="size-3.5" />
              </div>
              <div className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground">
                <ListChecks className="size-3.5" />
              </div>
              <div className="flex size-7 items-center justify-center rounded-md border border-emerald-500/15 bg-emerald-500/[0.08] text-emerald-600">
                <Save className="size-3.5" />
              </div>
            </div>
          </div>

          {/* Config content */}
          <div className="scrollbar-thin-muted min-h-0 flex-1 overflow-hidden p-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 min-w-8 items-center justify-center rounded-md bg-muted px-1.5 text-[11px] font-semibold tabular-nums">
                  S5
                </span>
                <span className="text-sm font-medium">Render Template</span>
                <LayoutTemplate className="size-3.5 text-muted-foreground" />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Fills a template&apos;s placeholders and renders the final PNG.
              </p>

              <div className="h-px bg-border" />

              <ConfigField
                label="Template"
                value="Brand Template — Instagram Post"
                type="select"
              />

              <div className="rounded-md border border-border p-2.5">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Placeholder bindings
                </span>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                      <TypeIcon className="size-2.5" /> title
                    </span>
                    <span className="text-muted-foreground/40">→</span>
                    <div className="min-w-0 flex-1 truncate rounded border border-border bg-background px-1.5 py-1 font-mono text-[10px]">
                      {"{{S3.best.title}}"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                      <Images className="size-2.5" /> background
                    </span>
                    <span className="text-muted-foreground/40">→</span>
                    <div className="min-w-0 flex-1 truncate rounded border border-border bg-background px-1.5 py-1 font-mono text-[10px]">
                      {"{{S4.best.url}}"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                      <TypeIcon className="size-2.5" /> location
                    </span>
                    <span className="text-muted-foreground/40">→</span>
                    <div className="min-w-0 flex-1 truncate rounded border border-border bg-background px-1.5 py-1 font-mono text-[10px]">
                      {"{{S1.body.city}}"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2">
                <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  Outputs: Render URL, Render URLs (all pages)
                </span>
              </div>

              <div className="h-px bg-border" />

              <ConfigField
                label="Ranking criteria"
                value="Prefer polished travel photos: wide landscape views, recognizable landmarks, waterfronts, blue sky, vivid color…"
                type="textarea"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
