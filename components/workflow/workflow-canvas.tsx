"use client";

import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type DefaultEdgeOptions,
  type NodeTypes,
} from "@xyflow/react";
import { listNodeCatalog } from "@/lib/nodes/catalog";
import { useWorkflowEditor } from "@/lib/workflows/store";
import { WorkflowNode } from "./workflow-node";

// Every registered node type renders with the single generic node component.
const nodeTypes: NodeTypes = Object.fromEntries(
  listNodeCatalog().map((t) => [t.id, WorkflowNode]),
);

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  markerEnd: {
    type: MarkerType.ArrowClosed,
  },
};

export function WorkflowCanvas() {
  const nodes = useWorkflowEditor((s) => s.nodes);
  const edges = useWorkflowEditor((s) => s.edges);
  const onNodesChange = useWorkflowEditor((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowEditor((s) => s.onEdgesChange);
  const onConnect = useWorkflowEditor((s) => s.onConnect);
  const selectNode = useWorkflowEditor((s) => s.selectNode);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => selectNode(node.id)}
      onPaneClick={() => selectNode(null)}
      defaultEdgeOptions={defaultEdgeOptions}
      fitView
      minZoom={0.2}
      deleteKeyCode={["Backspace", "Delete"]}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
