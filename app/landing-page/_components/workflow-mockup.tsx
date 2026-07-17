import {
  Braces,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  ListChecks,
  Maximize,
  Minus,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { AppFrame } from "./app-frame";
import { MockSelect } from "./mock-ui";

/**
 * The Ignis workflow editor, reproduced 1:1 from components/workflow/*:
 * node palette (node-palette.tsx) with the real catalog labels/descriptions,
 * React Flow canvas with step cards and insert-step buttons on the connectors
 * (workflow-node.tsx / workflow-canvas.tsx), and the config panel for the
 * selected Render Template step (node-config-panel.tsx). Nothing is wired up.
 */

const PALETTE: {
  group: string;
  items: { label: string; desc: string; disabled?: boolean }[];
}[] = [
  {
    group: "Media",
    items: [
      {
        label: "Find Location Images",
        desc: "Searches free/open image sources for real, reusable photos near the location.",
      },
      {
        label: "Curate Images",
        desc: "Pauses so you can swap similar images with alternates before continuing.",
      },
      {
        label: "Rehost Image",
        desc: "Copies an image from an expiring URL (e.g. a Notion file) into permanent storage.",
      },
    ],
  },
  {
    group: "AI",
    items: [
      {
        label: "Rank Images",
        desc: "Rates supported public image URLs with vision and returns them sorted best-first.",
      },
      {
        label: "Categorize Images",
        desc: "Assigns each image to one of your categories with vision.",
      },
      {
        label: "LLM Prompt",
        desc: "Calls an AI model with a custom prompt and returns generated text.",
      },
    ],
  },
  {
    group: "Design",
    items: [
      {
        label: "Render Template",
        desc: "Fills a template's placeholders and renders the final PNG.",
      },
      {
        label: "Render Template Batch",
        desc: "Renders several template versions from an input image list.",
      },
      {
        label: "Preview Design Image",
        desc: "Pauses so you can preview candidate images inside a selected design.",
      },
      {
        label: "Review Designs",
        desc: "Pauses the workflow so you can pick one generated design.",
      },
    ],
  },
  {
    group: "Flow",
    items: [
      {
        label: "Manual Review",
        desc: "Choose the final image — automatically or by pausing for a human pick.",
      },
      {
        label: "Router",
        desc: "Routes the workflow down one of several branches based on conditions.",
      },
    ],
  },
  {
    group: "Google Drive",
    items: [
      {
        label: "List Drive Images",
        desc: "Lists image files inside a Google Drive folder and its subfolders.",
      },
      {
        label: "Upload Drive Files",
        desc: "Uploads one or more files to a Google Drive folder from file URLs.",
      },
    ],
  },
  {
    group: "Notion",
    items: [
      {
        label: "Update Notion Page",
        desc: "Updates selected Notion page properties from webhook or step data.",
      },
    ],
  },
];

function PaletteButton({
  label,
  desc,
  disabled,
}: {
  label: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-md border border-transparent bg-muted/25 px-2 py-1.5 text-left text-sm",
        disabled && "opacity-50",
      )}
    >
      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium leading-4">
          {label}
        </span>
        <span className="block truncate text-[11px] leading-4 text-muted-foreground">
          {desc}
        </span>
      </span>
    </div>
  );
}

function PaletteGroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <span className="text-[10px] tabular-nums text-muted-foreground/70">
        {count}
      </span>
    </div>
  );
}

/** A step card matching workflow-node.tsx exactly (badge + name, no icons). */
function StepCard({
  step,
  label,
  isTrigger,
  selected,
}: {
  step: string;
  label: string;
  isTrigger?: boolean;
  selected?: boolean;
}) {
  return (
    <div className="relative">
      <div
        className={cn(
          "w-56 rounded-lg border bg-background px-3 py-2.5 shadow-sm",
          selected
            ? "border-foreground/40 ring-1 ring-foreground/20"
            : "border-border",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums",
              isTrigger
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {step}
          </span>
          <div className="min-w-0">
            <span className="block truncate text-sm font-medium">{label}</span>
            {isTrigger ? (
              <span className="block truncate text-[11px] text-muted-foreground">
                Trigger
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Per-node toolbar shown next to the selected step. */}
      {selected ? (
        <div className="absolute left-full top-1/2 ml-2 flex -translate-y-1/2 items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm">
          <span className="flex size-6 items-center justify-center rounded text-muted-foreground">
            <ChevronUp className="size-4" />
          </span>
          <span className="flex size-6 items-center justify-center rounded text-muted-foreground">
            <ChevronDown className="size-4" />
          </span>
          <span className="flex size-6 items-center justify-center rounded">
            <Trash2 className="size-4 text-destructive" />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Connector edge with the insert-step "+" button the real canvas shows. */
function EdgeConnector() {
  return (
    <div className="relative flex h-10 justify-center">
      <div className="w-[1.5px] bg-border" />
      <span className="absolute top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
        <Plus className="size-3.5" />
      </span>
    </div>
  );
}

function KindBadge({ kind }: { kind: "text" | "image" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        kind === "image"
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      {kind}
    </span>
  );
}

function BindingRow({
  name,
  kind,
  token,
  placeholder,
}: {
  name: string;
  kind: "text" | "image";
  token?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Label>{name}</Label>
        <KindBadge kind={kind} />
      </div>
      <div className="flex items-start gap-1.5">
        <Input readOnly value={token ?? ""} placeholder={placeholder} />
        <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1 px-2 text-xs">
          <Braces className="size-3.5" /> Data
        </Button>
      </div>
    </div>
  );
}

const STEPS = [
  { step: "S1", label: "Webhook", isTrigger: true },
  { step: "S2", label: "Find Location Images" },
  { step: "S3", label: "Rank Images" },
  { step: "S4", label: "Curate Images" },
  { step: "S5", label: "Render Template", selected: true },
  { step: "S6", label: "Upload Drive Files" },
];

export function WorkflowMockup() {
  return (
    <AppFrame path="/workflows/lisbon-pipeline">
      <div className="flex h-[560px]">
        {/* Node palette — node-palette.tsx */}
        <aside className="scrollbar-thin-muted hidden w-56 shrink-0 overflow-y-auto border-r bg-sidebar p-3 md:block">
          <div className="flex flex-col gap-3">
            <section className="flex flex-col gap-1">
              <PaletteGroupHeader label="Trigger" count={1} />
              <PaletteButton
                label="Webhook"
                desc="A workflow can have only one trigger"
                disabled
              />
            </section>
            <section className="flex flex-col gap-2.5">
              <p className="px-1 text-[11px] font-medium text-muted-foreground">
                Steps
              </p>
              {PALETTE.map(({ group, items }) => (
                <section key={group} className="flex flex-col gap-1">
                  <PaletteGroupHeader label={group} count={items.length} />
                  <div className="flex flex-col gap-1">
                    {items.map((item) => (
                      <PaletteButton key={item.label} {...item} />
                    ))}
                  </div>
                </section>
              ))}
            </section>
          </div>
        </aside>

        {/* Canvas — workflow-canvas.tsx (React Flow) */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {/* React Flow's default dotted background. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, color-mix(in oklch, var(--foreground), transparent 82%) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />

          <div className="relative flex h-full flex-col items-center justify-center">
            {STEPS.map((s, i) => (
              <div key={s.step} className="flex flex-col items-center">
                {i > 0 ? <EdgeConnector /> : null}
                <StepCard {...s} />
              </div>
            ))}
          </div>

          {/* React Flow controls (bottom-left). */}
          <div className="absolute bottom-4 left-4 flex flex-col overflow-hidden rounded-md border bg-background shadow-sm">
            <span className="flex size-7 items-center justify-center border-b text-muted-foreground">
              <Plus className="size-3.5" />
            </span>
            <span className="flex size-7 items-center justify-center border-b text-muted-foreground">
              <Minus className="size-3.5" />
            </span>
            <span className="flex size-7 items-center justify-center text-muted-foreground">
              <Maximize className="size-3.5" />
            </span>
          </div>
        </div>

        {/* Config panel — workflow-editor.tsx + node-config-panel.tsx */}
        <aside className="hidden w-[26rem] shrink-0 flex-col overflow-hidden border-l bg-background lg:flex">
          <div className="shrink-0 border-b bg-background/95 p-3">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                aria-label="Workflow name"
                value="Lisbon Poster Pipeline"
                className="h-8 min-w-0 flex-1 rounded-md font-medium"
              />
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <Switch size="sm" defaultChecked aria-label="Workflow active" />
                <span>Active</span>
              </label>
              <Button variant="outline" size="icon-sm" aria-label="Test workflow">
                <FlaskConical className="size-4" />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Runs">
                <ListChecks className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="All changes saved"
                className="border-emerald-500/15 bg-emerald-500/[0.08] text-emerald-700 hover:bg-emerald-500/[0.12] dark:text-emerald-300"
              >
                <Save className="size-4" />
              </Button>
            </div>
          </div>

          <div className="scrollbar-thin-muted min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4">
              <div>
                <Input
                  readOnly
                  value=""
                  placeholder="Render Template"
                  aria-label="Step name"
                  className="h-8 font-semibold"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Render Template — Fills a template&apos;s placeholders and
                  renders the final PNG.
                </p>
              </div>

              <Tabs defaultValue="config" className="min-w-0 gap-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="config">Config</TabsTrigger>
                  <TabsTrigger value="test">Test</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-col gap-1.5">
                <Label>Template</Label>
                <MockSelect value="Lisbon Poster" />
                <p className="text-xs text-muted-foreground">
                  The design to render.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
                  Placeholders
                </p>
                <BindingRow name="title" kind="text" token="{{S1.body.city}}" />
                <BindingRow name="subtitle" kind="text" token="{{S3.best.title}}" />
                <BindingRow name="background" kind="image" token="{{S4.best.url}}" />
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="self-start text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" /> Delete node
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </AppFrame>
  );
}
