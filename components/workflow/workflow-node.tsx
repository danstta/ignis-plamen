"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getNodeMeta } from "@/lib/nodes/catalog";
import type { NodePort } from "@/lib/nodes/types";
import { cn } from "@/lib/utils";

const CATEGORY_COLOR: Record<string, string> = {
  trigger: "bg-amber-500",
  source: "bg-sky-500",
  transform: "bg-violet-500",
  control: "bg-rose-500",
  output: "bg-emerald-500",
};

const PORT_KIND_CLASS: Record<NodePort["kind"], string> = {
  data: "border-sky-500 bg-sky-500",
  image: "border-emerald-500 bg-emerald-500",
  text: "border-amber-500 bg-amber-500",
};

/** A slim port row: just a labelled handle dot anchored to the node's edge. */
function PortRow({
  port,
  direction,
}: {
  port: NodePort;
  direction: "in" | "out";
}) {
  const isInput = direction === "in";
  return (
    <div
      className={cn(
        "relative flex h-6 items-center px-3 text-xs text-muted-foreground",
        isInput ? "justify-start" : "justify-end",
      )}
    >
      <Handle
        id={port.id}
        type={isInput ? "target" : "source"}
        position={isInput ? Position.Left : Position.Right}
        className={cn(
          "!size-2.5 !rounded-full !border-2 !border-background shadow-sm",
          PORT_KIND_CLASS[port.kind],
        )}
        style={{ top: "50%" }}
      />
      <span className="truncate">{port.label}</span>
    </div>
  );
}

/** A single generic node renderer driven entirely by its NodeDefinition ports. */
function WorkflowNodeImpl({ type, selected }: NodeProps) {
  const def = getNodeMeta(type);
  if (!def) {
    return (
      <div className="rounded-md border border-destructive bg-background px-3 py-2 text-xs text-destructive">
        Unknown node: {type}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-w-44 rounded-md border bg-background shadow-sm transition-colors",
        selected
          ? "border-foreground/40 ring-1 ring-foreground/20"
          : "border-border",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            CATEGORY_COLOR[def.category] ?? "bg-muted-foreground",
          )}
        />
        <span className="truncate text-sm font-medium">{def.label}</span>
      </div>

      {def.inputs.length || def.outputs.length ? (
        <div className="border-t py-1.5">
          {def.inputs.map((port) => (
            <PortRow key={port.id} port={port} direction="in" />
          ))}
          {def.outputs.map((port) => (
            <PortRow key={port.id} port={port} direction="out" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeImpl);
