"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import { listNodeCatalog } from "@/lib/nodes/catalog";
import { useWorkflowEditor, type WfNode } from "@/lib/workflows/store";
import { buildStructure } from "@/lib/workflows/editor-structure";
import { WorkflowNode } from "./workflow-node";

// Every registered node type renders with the single generic node component.
const nodeTypes: NodeTypes = Object.fromEntries(
  listNodeCatalog().map((t) => [t.id, WorkflowNode]),
);

function connector(
  source: string,
  target: string,
  options: { id?: string; dashed?: boolean } = {},
): Edge {
  return {
    id: options.id ?? `spine-${source}-${target}`,
    source,
    target,
    sourceHandle: "out",
    targetHandle: "in",
    type: "smoothstep",
    focusable: false,
    selectable: false,
    deletable: false,
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
function buildSpine(nodes: WfNode[]): Edge[] {
  const structure = buildStructure(nodes);
  const edges: Edge[] = [];

  structure.forEach((entry, i) => {
    const previous = structure[i - 1]?.node;
    const next = structure[i + 1]?.node;

    if (entry.lanes.length === 0) {
      if (next) edges.push(connector(entry.node.id, next.id));
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
      edges.push(connector(entry.node.id, lane.nodes[0].id));
      for (let k = 1; k < lane.nodes.length; k++) {
        edges.push(connector(lane.nodes[k - 1].id, lane.nodes[k].id));
      }
      if (next) {
        edges.push(connector(lane.nodes[lane.nodes.length - 1].id, next.id));
      }
    }
    // All branches empty: keep the trunk visually connected through the router.
    if (!anyBranchHasSteps && next) edges.push(connector(entry.node.id, next.id));
  });

  return edges;
}

export function WorkflowCanvas() {
  const nodes = useWorkflowEditor((s) => s.nodes);
  const onNodesChange = useWorkflowEditor((s) => s.onNodesChange);
  const selectNode = useWorkflowEditor((s) => s.selectNode);
  const removeNode = useWorkflowEditor((s) => s.removeNode);

  const spine = useMemo(() => buildSpine(nodes), [nodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={spine}
      nodeTypes={nodeTypes}
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
  );
}
