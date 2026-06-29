"use client";

import { memo } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
} from "@xyflow/react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { getNodeMeta } from "@/lib/nodes/catalog";
import { useWorkflowEditor } from "@/lib/workflows/store";
import { cn } from "@/lib/utils";

function isTriggerKind(type: string | undefined): boolean {
  return !!type && getNodeMeta(type)?.category === "trigger";
}

/** A tiny icon button used in the per-node toolbar. */
function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * A minimal step card: a Step badge plus the node's name. Ports and data wiring
 * are hidden here (configured in the side panel) so the canvas reads as a clean
 * vertical sequence. The hidden top/bottom handles only anchor the spine line.
 */
function WorkflowNodeImpl({ id, type, selected }: NodeProps) {
  const def = getNodeMeta(type);
  const step = useWorkflowEditor((s) => s.nodes.findIndex((n) => n.id === id));
  const moveNode = useWorkflowEditor((s) => s.moveNode);
  const removeNode = useWorkflowEditor((s) => s.removeNode);
  const canMoveUp = useWorkflowEditor((s) => {
    const i = s.nodes.findIndex((n) => n.id === id);
    return i > 0 && !isTriggerKind(s.nodes[i].type) && !isTriggerKind(s.nodes[i - 1].type);
  });
  const canMoveDown = useWorkflowEditor((s) => {
    const i = s.nodes.findIndex((n) => n.id === id);
    return i >= 0 && i < s.nodes.length - 1 && !isTriggerKind(s.nodes[i].type);
  });

  if (!def) {
    return (
      <div className="rounded-md border border-destructive bg-background px-3 py-2 text-xs text-destructive">
        Unknown node: {type}
      </div>
    );
  }

  const isTrigger = def.category === "trigger";

  return (
    <>
      <NodeToolbar
        isVisible={selected}
        position={Position.Right}
        className="flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm"
      >
        {!isTrigger ? (
          <>
            <ToolButton
              label="Move up"
              disabled={!canMoveUp}
              onClick={() => moveNode(id, "up")}
            >
              <ChevronUp className="size-4" />
            </ToolButton>
            <ToolButton
              label="Move down"
              disabled={!canMoveDown}
              onClick={() => moveNode(id, "down")}
            >
              <ChevronDown className="size-4" />
            </ToolButton>
          </>
        ) : null}
        <ToolButton label="Delete step" onClick={() => removeNode(id)}>
          <Trash2 className="size-4 text-destructive" />
        </ToolButton>
      </NodeToolbar>

      <Handle
        type="target"
        position={Position.Top}
        id="in"
        isConnectable={false}
        className="!size-1.5 !min-w-0 !border-0 !bg-border opacity-0"
      />

      <div
        className={cn(
          "w-56 rounded-lg border bg-background px-3 py-2.5 shadow-sm transition-colors",
          selected
            ? "border-foreground/40 ring-1 ring-foreground/20"
            : "border-border hover:border-foreground/20",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
              isTrigger
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {step >= 0 ? step : "?"}
          </span>
          <div className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {def.label}
            </span>
            {isTrigger ? (
              <span className="block text-[11px] text-muted-foreground">
                Trigger
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        isConnectable={false}
        className="!size-1.5 !min-w-0 !border-0 !bg-border opacity-0"
      />
    </>
  );
}

export const WorkflowNode = memo(WorkflowNodeImpl);
