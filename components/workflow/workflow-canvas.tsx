"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Panel,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { listNodeCatalog } from "@/lib/nodes/catalog";
import { useWorkflowEditor, type WfNode } from "@/lib/workflows/store";
import { ROUTER_TYPE_ID } from "@/lib/workflows/conditions";
import { buildStructure } from "@/lib/workflows/editor-structure";
import { WorkflowNode } from "./workflow-node";
import { NodePickerDialog } from "./node-picker-dialog";

// Every registered node type renders with the single generic node component.
const nodeTypes: NodeTypes = Object.fromEntries(
  listNodeCatalog().map((t) => [t.id, WorkflowNode]),
);

type SpineEdgeData = {
  /** Present on insertable connectors; opens the step picker for this gap. */
  onInsert?: (sourceId: string, targetId: string) => void;
};

/**
 * A spine connector with an optional + button at its midpoint that inserts a
 * step between the two nodes it links (redo-loop connectors omit it).
 */
function SpineEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const onInsert = (data as SpineEdgeData | undefined)?.onInsert;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {onInsert ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            title="Add a step here"
            aria-label="Add a step here"
            onClick={(e) => {
              e.stopPropagation();
              onInsert(source, target);
            }}
            className="nodrag nopan pointer-events-auto absolute flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:border-foreground/40 hover:bg-accent hover:text-foreground"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <Plus className="size-3.5" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const edgeTypes: EdgeTypes = { spine: SpineEdge };

function connector(
  source: string,
  target: string,
  options: {
    id?: string;
    dashed?: boolean;
    onInsert?: SpineEdgeData["onInsert"];
  } = {},
): Edge {
  return {
    id: options.id ?? `spine-${source}-${target}`,
    source,
    target,
    sourceHandle: "out",
    targetHandle: "in",
    type: "spine",
    focusable: false,
    selectable: false,
    deletable: false,
    data: options.onInsert ? { onInsert: options.onInsert } : undefined,
    style: {
      stroke: "var(--border)",
      strokeWidth: 1.5,
      ...(options.dashed ? { strokeDasharray: "5 4" } : {}),
    },
  };
}

/**
 * The control-flow "spine": connectors derived from step structure, not from the
 * graph's data edges (data wiring lives in the config panel). The trunk links
 * consecutive steps; a Router instead links down into each branch's first step,
 * along each branch, and back from each branch's last step to the rejoin (the
 * next trunk step). Presentation-only — never persisted.
 */
function buildSpine(
  nodes: WfNode[],
  onInsert: SpineEdgeData["onInsert"],
): Edge[] {
  const structure = buildStructure(nodes);
  const edges: Edge[] = [];

  structure.forEach((entry, i) => {
    const previous = structure[i - 1]?.node;
    const next = structure[i + 1]?.node;

    if (entry.lanes.length === 0) {
      if (next) edges.push(connector(entry.node.id, next.id, { onInsert }));
      return;
    }

    // Router: fan out into each non-empty branch, then rejoin at `next`.
    let anyBranchHasSteps = false;
    for (const lane of entry.lanes) {
      if (lane.column.routeMode === "redoPrevious") {
        if (previous) {
          edges.push(
            connector(entry.node.id, previous.id, {
              id: `redo-${entry.node.id}-${lane.column.branchId}-${previous.id}`,
              dashed: true,
            }),
          );
        }
        continue;
      }
      if (lane.nodes.length === 0) continue;
      anyBranchHasSteps = true;
      edges.push(connector(entry.node.id, lane.nodes[0].id, { onInsert }));
      for (let k = 1; k < lane.nodes.length; k++) {
        edges.push(
          connector(lane.nodes[k - 1].id, lane.nodes[k].id, { onInsert }),
        );
      }
      if (next) {
        edges.push(
          connector(lane.nodes[lane.nodes.length - 1].id, next.id, {
            onInsert,
          }),
        );
      }
    }
    // All branches empty: keep the trunk visually connected through the router.
    if (!anyBranchHasSteps && next) {
      edges.push(connector(entry.node.id, next.id, { onInsert }));
    }
  });

  return edges;
}

export function WorkflowCanvas({
  enabledNodeTypeIds,
}: {
  enabledNodeTypeIds: string[];
}) {
  const nodes = useWorkflowEditor((s) => s.nodes);
  const onNodesChange = useWorkflowEditor((s) => s.onNodesChange);
  const selectNode = useWorkflowEditor((s) => s.selectNode);
  const removeNode = useWorkflowEditor((s) => s.removeNode);
  const insertNodeBetween = useWorkflowEditor((s) => s.insertNodeBetween);

  /** The gap a + button was clicked on; non-null while the picker is open. */
  const [pendingInsert, setPendingInsert] = useState<{
    sourceId: string;
    targetId: string;
    inBranch: boolean;
  } | null>(null);

  const requestInsert = useCallback((sourceId: string, targetId: string) => {
    const current = useWorkflowEditor.getState().nodes;
    const source = current.find((n) => n.id === sourceId);
    const target = current.find((n) => n.id === targetId);
    // Same lane resolution as insertNodeBetween — decides whether the step
    // would land in a branch (where routers aren't allowed).
    const inBranch = !!(target?.data.branch ?? source?.data.branch);
    setPendingInsert({ sourceId, targetId, inBranch });
  }, []);

  const spine = useMemo(
    () => buildSpine(nodes, requestInsert),
    [nodes, requestInsert],
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={spine}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodesDelete={(deleted) => deleted.forEach((n) => removeNode(n.id))}
        onNodeClick={(_, node) => selectNode(node.id)}
        onPaneClick={() => selectNode(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.2}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background />
        <Controls showInteractive={false} />
        {nodes.length === 0 ? (
          <Panel position="top-center">
            <p className="mt-16 rounded-md border border-dashed bg-background/80 px-4 py-3 text-center text-sm text-muted-foreground">
              Add a trigger from the panel to begin.
            </p>
          </Panel>
        ) : null}
      </ReactFlow>

      <NodePickerDialog
        open={pendingInsert !== null}
        onOpenChange={(open) => {
          if (!open) setPendingInsert(null);
        }}
        enabledNodeTypeIds={enabledNodeTypeIds}
        excludeTypeIds={pendingInsert?.inBranch ? [ROUTER_TYPE_ID] : undefined}
        onPick={(nodeTypeId) => {
          if (pendingInsert) {
            insertNodeBetween(
              nodeTypeId,
              pendingInsert.sourceId,
              pendingInsert.targetId,
            );
          }
          setPendingInsert(null);
        }}
      />
    </>
  );
}
