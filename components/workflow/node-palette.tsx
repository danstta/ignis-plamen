"use client";

import { Plus } from "lucide-react";
import { listNodeCatalog } from "@/lib/nodes/catalog";
import { useWorkflowEditor } from "@/lib/workflows/store";

/** Palette of node types, filtered to those whose plugin is enabled. */
export function NodePalette({ enabledNodeTypeIds }: { enabledNodeTypeIds: string[] }) {
  const addNode = useWorkflowEditor((s) => s.addNode);
  const enabled = new Set(enabledNodeTypeIds);
  const types = listNodeCatalog().filter((t) => enabled.has(t.id));

  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-xs font-medium text-muted-foreground">Nodes</p>
      {types.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          No nodes enabled. Turn on a plugin in Plugins.
        </p>
      ) : (
        types.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              addNode(t.id, {
                x: 160,
                y: 80,
              })
            }
            className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-sm hover:border-foreground/20 hover:bg-accent"
            title={t.description}
          >
            <Plus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {t.description}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
