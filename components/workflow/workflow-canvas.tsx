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
import { WorkflowNode } from "./workflow-node";

// Every registered node type renders with the single generic node component.
const nodeTypes: NodeTypes = Object.fromEntries(
  listNodeCatalog().map((t) => [t.id, WorkflowNode]),
);

/**
 * The vertical "spine": a thin connector between each consecutive step. It's
 * derived from step order (array index), not from the graph's data edges — data
 * wiring lives in the config panel, so the canvas stays a clean top-to-bottom
 * sequence. These connectors are presentation-only and never persisted.
 */
function buildSpine(nodes: WfNode[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 1; i < nodes.length; i++) {
    edges.push({
      id: `spine-${nodes[i - 1].id}-${nodes[i].id}`,
      source: nodes[i - 1].id,
      target: nodes[i].id,
      sourceHandle: "out",
      targetHandle: "in",
      type: "straight",
      focusable: false,
      selectable: false,
      deletable: false,
      style: { stroke: "var(--border)", strokeWidth: 1.5 },
    });
  }
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
