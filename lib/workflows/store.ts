import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  MarkerType,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { getNodeMeta } from "@/lib/nodes/catalog";
import type { WorkflowGraph } from "./types";

/** xyflow node data: just the node-type config (the type id lives on node.type). */
export type WfNodeData = { config: Record<string, unknown> };
export type WfNode = Node<WfNodeData>;

const DEFAULT_NODE_POSITION = { x: 160, y: 80 };
const DEFAULT_NODE_GAP_Y = 280;

function presentEdge(edge: Edge): Edge {
  return {
    ...edge,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  };
}

export type WorkflowLoadInput = {
  id: string | null;
  name: string;
  active: boolean;
  triggerConnectionId: string | null;
  graph: WorkflowGraph;
};

interface WorkflowEditorState {
  workflowId: string | null;
  name: string;
  active: boolean;
  triggerConnectionId: string | null;
  nodes: WfNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  dirty: boolean;

  load: (input: WorkflowLoadInput) => void;
  setName: (name: string) => void;
  setActive: (active: boolean) => void;
  setTriggerConnectionId: (id: string | null) => void;
  markSaved: (id?: string) => void;

  onNodesChange: OnNodesChange<WfNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (nodeTypeId: string, position: { x: number; y: number }) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  selectNode: (id: string | null) => void;
  removeNode: (id: string) => void;

  toGraph: () => WorkflowGraph;
}

/** Build a node's default config from its field defaults (parse {} through the schema). */
function defaultConfig(nodeTypeId: string): Record<string, unknown> {
  const meta = getNodeMeta(nodeTypeId);
  if (!meta) return {};
  const parsed = meta.configSchema.safeParse({});
  return parsed.success ? (parsed.data as Record<string, unknown>) : {};
}

function graphToFlow(graph: WorkflowGraph): { nodes: WfNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { config: n.config },
    })),
    edges: graph.edges.map((e) =>
      presentEdge({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      }),
    ),
  };
}

export const useWorkflowEditor = create<WorkflowEditorState>((set, get) => ({
  workflowId: null,
  name: "Untitled workflow",
  active: false,
  triggerConnectionId: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  dirty: false,

  load: (input) => {
    const { nodes, edges } = graphToFlow(input.graph);
    set({
      workflowId: input.id,
      name: input.name,
      active: input.active,
      triggerConnectionId: input.triggerConnectionId,
      nodes,
      edges,
      selectedNodeId: null,
      dirty: false,
    });
  },

  setName: (name) => set({ name, dirty: true }),
  setActive: (active) => set({ active, dirty: true }),
  setTriggerConnectionId: (triggerConnectionId) =>
    set({ triggerConnectionId, dirty: true }),
  markSaved: (id) =>
    set((s) => ({ dirty: false, workflowId: id ?? s.workflowId })),

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      dirty: true,
    })),
  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges), dirty: true })),
  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge(
        presentEdge({
          ...connection,
          id: crypto.randomUUID(),
        }),
        s.edges,
      ),
      dirty: true,
    })),

  addNode: (nodeTypeId, position) =>
    set((s) => {
      const nextPosition =
        s.nodes.length === 0
          ? position
          : {
              x: s.nodes[0]?.position.x ?? DEFAULT_NODE_POSITION.x,
              y:
                Math.max(...s.nodes.map((n) => n.position.y)) +
                DEFAULT_NODE_GAP_Y,
            };
      const node: WfNode = {
        id: crypto.randomUUID(),
        type: nodeTypeId,
        position: nextPosition,
        data: { config: defaultConfig(nodeTypeId) },
      };
      return { nodes: [...s.nodes, node], selectedNodeId: node.id, dirty: true };
    }),

  updateNodeConfig: (nodeId, config) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config } } : n,
      ),
      dirty: true,
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      dirty: true,
    })),

  toGraph: () => {
    const { nodes, edges } = get();
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? "",
        position: n.position,
        config: n.data?.config ?? {},
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    };
  },
}));
