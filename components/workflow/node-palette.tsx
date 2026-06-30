"use client";

import { Plus } from "lucide-react";
import { getNodeMeta, listNodeCatalog } from "@/lib/nodes/catalog";
import type { NodeMeta } from "@/lib/nodes/types";
import { useWorkflowEditor } from "@/lib/workflows/store";
import { cn } from "@/lib/utils";

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
        "flex w-full items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-sm",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-foreground/20 hover:bg-accent",
      )}
      title={disabled ? hint : meta.description}
    >
      <Plus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{meta.label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {disabled ? hint : meta.description}
        </span>
      </span>
    </button>
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

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <p className="px-1 text-xs font-medium text-muted-foreground">Trigger</p>
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

      <section className="flex flex-col gap-1.5">
        <p className="px-1 text-xs font-medium text-muted-foreground">Steps</p>
        {steps.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">
            No step nodes enabled. Turn on a plugin in Plugins.
          </p>
        ) : (
          steps.map((t) => (
            <PaletteButton
              key={t.id}
              meta={t}
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
