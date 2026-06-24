"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ArrowDownToLine, ArrowUpFromLine, GitBranch } from "lucide-react";
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

function PortRow({
  port,
  direction,
  branchable,
}: {
  port: NodePort;
  direction: "import" | "export";
  branchable?: boolean;
}) {
  const isImport = direction === "import";
  const Icon = isImport ? ArrowDownToLine : ArrowUpFromLine;

  return (
    <div
      className={cn(
        "group relative flex h-9 items-center gap-2 rounded-sm border bg-muted/20 px-2 text-xs",
        isImport ? "pl-4" : "pr-4",
      )}
    >
      <Handle
        id={port.id}
        type={isImport ? "target" : "source"}
        position={isImport ? Position.Left : Position.Right}
        className={cn(
          "!h-3 !w-3 !rounded-full !border-2 !border-background shadow-sm",
          PORT_KIND_CLASS[port.kind],
        )}
        style={{ top: "50%" }}
      />
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-sm border bg-background text-muted-foreground",
          isImport ? "order-first" : "order-last",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {port.label}
      </span>
      {branchable ? (
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground"
          title="Can branch into multiple downstream nodes"
        >
          <GitBranch className="size-3.5" />
        </span>
      ) : null}
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

  const branchableExports = def.outputs.length > 1;

  return (
    <div
      className={cn(
        "min-w-52 rounded-md border bg-background shadow-sm transition-colors",
        selected ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            CATEGORY_COLOR[def.category] ?? "bg-muted-foreground",
          )}
        />
        <span className="truncate text-sm font-medium">{def.label}</span>
      </div>

      <div className="space-y-2 p-2">
        <div className="space-y-1">
          <div className="px-1 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
            Import
          </div>
          {def.inputs.length ? (
            def.inputs.map((port) => (
              <PortRow key={port.id} port={port} direction="import" />
            ))
          ) : (
            <div className="rounded-sm border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
              Starts here
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="px-1 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
            Export
          </div>
          {def.outputs.length ? (
            def.outputs.map((port) => (
              <PortRow
                key={port.id}
                port={port}
                direction="export"
                branchable={branchableExports}
              />
            ))
          ) : (
            <div className="rounded-sm border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
              Ends here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeImpl);
