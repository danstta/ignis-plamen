"use client";

import { memo } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
} from "@xyflow/react";
import { ChevronDown, ChevronUp, GitBranch, Trash2 } from "lucide-react";
import { getNodeMeta } from "@/lib/nodes/catalog";
import { ROUTER_TYPE_ID } from "@/lib/workflows/conditions";
import { routerBranchColumns } from "@/lib/nodes/router/meta";
import { useWorkflowEditor, type WfNodeData } from "@/lib/workflows/store";
import { cn } from "@/lib/utils";

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

const hiddenHandle =
  "!size-1.5 !min-w-0 !border-0 !bg-border opacity-0";

/**
 * A minimal step card: a Step badge plus the node's name. Ports and data wiring
 * are hidden here (configured in the side panel) so the canvas reads as a clean
 * sequence of columns. The hidden top/bottom handles only anchor the connectors.
 * A Router renders distinctly, listing its branch labels.
 */
function WorkflowNodeImpl({ id, type, selected, data }: NodeProps) {
  const def = getNodeMeta(type);
  const moveNode = useWorkflowEditor((s) => s.moveNode);
  const removeNode = useWorkflowEditor((s) => s.removeNode);

  if (!def) {
    return (
      <div className="rounded-md border border-destructive bg-background px-3 py-2 text-xs text-destructive">
        Unknown node: {type}
      </div>
    );
  }

  const d = data as WfNodeData;
  const isTrigger = def.category === "trigger";
  const isRouter = type === ROUTER_TYPE_ID;
  const step = d.step;
  const canMoveUp = !isTrigger && !d.laneFirst;
  const canMoveDown = !isTrigger && !d.laneLast;
  const branches = isRouter ? routerBranchColumns(d.config) : [];

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
        className={hiddenHandle}
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
                : isRouter
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {isRouter ? (
              <GitBranch className="size-3.5" />
            ) : step !== undefined ? (
              step
            ) : (
              "?"
            )}
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

        {isRouter ? (
          <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
            {branches.map((b) => (
              <span
                key={b.branchId}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  b.isElse
                    ? "bg-muted text-muted-foreground"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        isConnectable={false}
        className={hiddenHandle}
      />
    </>
  );
}

export const WorkflowNode = memo(WorkflowNodeImpl);
