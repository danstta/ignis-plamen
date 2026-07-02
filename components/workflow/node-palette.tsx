"use client";

import { Plus } from "lucide-react";
import { getNodeMeta, listNodeCatalog } from "@/lib/nodes/catalog";
import type { NodeGroup, NodeMeta } from "@/lib/nodes/types";
import { useWorkflowEditor } from "@/lib/workflows/store";
import { cn } from "@/lib/utils";

const NODE_GROUP_LABELS: Record<NodeGroup, string> = {
  trigger: "Trigger",
  media: "Media",
  ai: "AI",
  design: "Design",
  flow: "Flow",
  "google-drive": "Google Drive",
  notion: "Notion",
  utility: "Utility",
};

const STEP_GROUP_ORDER: NodeGroup[] = [
  "media",
  "ai",
  "design",
  "google-drive",
  "notion",
  "flow",
  "utility",
];

function groupNodes(nodes: NodeMeta[]) {
  const grouped = new Map<NodeGroup, NodeMeta[]>();

  for (const node of nodes) {
    grouped.set(node.group, [...(grouped.get(node.group) ?? []), node]);
  }

  return STEP_GROUP_ORDER.map((group) => ({
    group,
    nodes: grouped.get(group) ?? [],
  })).filter((entry) => entry.nodes.length > 0);
}

/** A single add-node button. Disabled buttons explain why via `hint`. */
function PaletteButton({
  meta,
  disabled,
  hint,
  onAdd,
}: {
  meta: NodeMeta;
  disabled?: boolean;
  hint?: string;
  onAdd: (id: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdd(meta.id)}
      className={cn(
        "group flex min-h-10 w-full items-center gap-2 rounded-md border border-transparent bg-muted/25 px-2 py-1.5 text-left text-sm transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-foreground/15 hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
      title={disabled ? hint : meta.description}
    >
      <Plus className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium leading-4">
          {meta.label}
        </span>
        <span className="block truncate text-[11px] leading-4 text-muted-foreground">
          {disabled ? hint : meta.description}
        </span>
      </span>
    </button>
  );
}

function PaletteGroup({
  group,
  nodes,
  disabled,
  hint,
  onAdd,
}: {
  group: NodeGroup;
  nodes: NodeMeta[];
  disabled?: boolean;
  hint?: string;
  onAdd: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          {NODE_GROUP_LABELS[group]}
        </p>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">
          {nodes.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {nodes.map((node) => (
          <PaletteButton
            key={node.id}
            meta={node}
            disabled={disabled}
            hint={hint}
            onAdd={onAdd}
          />
        ))}
      </div>
    </section>
  );
}

/** Palette of node types, split into the trigger and the step nodes. */
export function NodePalette({ enabledNodeTypeIds }: { enabledNodeTypeIds: string[] }) {
  const addNode = useWorkflowEditor((s) => s.addNode);
  const hasTrigger = useWorkflowEditor((s) =>
    s.nodes.some((n) => getNodeMeta(n.type ?? "")?.category === "trigger"),
  );

  const enabled = new Set(enabledNodeTypeIds);
  const available = listNodeCatalog().filter((t) => enabled.has(t.id));
  const triggers = available.filter((t) => t.category === "trigger");
  const steps = available.filter((t) => t.category !== "trigger");
  const stepGroups = groupNodes(steps);

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            Trigger
          </p>
          <span className="text-[10px] tabular-nums text-muted-foreground/70">
            {triggers.length}
          </span>
        </div>
        {triggers.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">
            No triggers enabled. Turn on a plugin in Plugins.
          </p>
        ) : (
          triggers.map((t) => (
            <PaletteButton
              key={t.id}
              meta={t}
              disabled={hasTrigger}
              hint="A workflow can have only one trigger"
              onAdd={addNode}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <p className="px-1 text-[11px] font-medium text-muted-foreground">
          Steps
        </p>
        {steps.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">
            No step nodes enabled. Turn on a plugin in Plugins.
          </p>
        ) : (
          stepGroups.map(({ group, nodes }) => (
            <PaletteGroup
              key={group}
              group={group}
              nodes={nodes}
              disabled={!hasTrigger}
              hint="Add a trigger first"
              onAdd={addNode}
            />
          ))
        )}
      </section>
    </div>
  );
}
