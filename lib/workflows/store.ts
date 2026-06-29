import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  MarkerType,
  type Node,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { getNodeMeta } from "@/lib/nodes/catalog";
import { topoOrder } from "./graph";
import type { WorkflowGraph, WorkflowNode } from "./types";

/** xyflow node data: just the node-type config (the type id lives on node.type). */
export type WfNodeData = { config: Record<string, unknown> };
export type WfNode = Node<WfNodeData>;

/**
 * The canvas is a single vertical column of steps (no free dragging). A node's
 * array index *is* its step number (the trigger is pinned to index 0 = Step 0),
 * and its on-canvas position is derived from that index, never hand-placed.
 * COLUMN_X is constant for now; branch layout (parallel columns) will vary it.
 */
const COLUMN_X = 0;
const ROW_GAP_Y = 110;

/** A trigger node (e.g. Webhook) starts a workflow and is always Step 0. */
function isTriggerType(type: string | undefined): boolean {
  return !!type && getNodeMeta(type)?.category === "trigger";
}

/** Position every node down a single column in array order, so index = step. */
function relayout(nodes: WfNode[]): WfNode[] {
  return nodes.map((n, i) => ({
    ...n,
    position: { x: COLUMN_X, y: i * ROW_GAP_Y },
  }));
}

/**
 * The step order for a loaded graph: trigger(s) first, then the remaining nodes
 * in execution (topological) order, so the visible Step numbers match the order
 * the engine actually runs them. Falls back to stored order if the graph has a
 * cycle (which the engine rejects anyway).
 */
function orderGraphNodes(graph: WorkflowGraph): WorkflowNode[] {
  const order = topoOrder(graph) ?? graph.nodes;
  const triggers = order.filter((n) => isTriggerType(n.type));
  const rest = order.filter((n) => !isTriggerType(n.type));
  return [...triggers, ...rest];
}

/**
 * Whether a change actually alters the saved graph. Selection highlighting and
 * measured dimensions are view-only state, so they must not flip `dirty` (which
 * would otherwise trigger a no-op autosave on every node click).
 */
function nodeChangeIsPersistent(change: NodeChange<WfNode>): boolean {
  return change.type !== "select" && change.type !== "dimensions";
}
function edgeChangeIsPersistent(change: EdgeChange): boolean {
  return change.type !== "select";
}

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
  graph: WorkflowGraph;
};

interface WorkflowEditorState {
  workflowId: string | null;
  name: string;
  active: boolean;
  nodes: WfNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  dirty: boolean;

  load: (input: WorkflowLoadInput) => void;
  setName: (name: string) => void;
  setActive: (active: boolean) => void;
  markSaved: () => void;

  onNodesChange: OnNodesChange<WfNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  /** Append a step (or pin a trigger to the top). One trigger max. */
  addNode: (nodeTypeId: string) => void;
  /** Reorder a step one slot up/down; the trigger stays pinned at Step 0. */
  moveNode: (id: string, direction: "up" | "down") => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  /** Map an upstream output port into an input port (replaces any existing edge there). */
  setInputEdge: (
    target: string,
    targetHandle: string,
    source: string,
    sourceHandle: string,
  ) => void;
  clearInputEdge: (target: string, targetHandle: string) => void;
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
  nodes: [],
  edges: [],
  selectedNodeId: null,
  dirty: false,

  load: (input) => {
    const ordered = orderGraphNodes(input.graph);
    const { nodes, edges } = graphToFlow({
      nodes: ordered,
      edges: input.graph.edges,
    });
    set({
      workflowId: input.id,
      name: input.name,
      active: input.active,
      nodes: relayout(nodes),
      edges,
      selectedNodeId: null,
      dirty: false,
    });
  },

  setName: (name) => set({ name, dirty: true }),
  setActive: (active) => set({ active, dirty: true }),
  markSaved: () => set({ dirty: false }),

  onNodesChange: (changes) =>
    set((s) => {
      // Removal is handled by removeNode (it also prunes edges and relayouts the
      // column), so drop xyflow's own remove changes to avoid double-handling.
      const applicable = changes.filter((c) => c.type !== "remove");
      return {
        nodes: applyNodeChanges(applicable, s.nodes),
        dirty: s.dirty || applicable.some(nodeChangeIsPersistent),
      };
    }),
  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: s.dirty || changes.some(edgeChangeIsPersistent),
    })),
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

  addNode: (nodeTypeId) =>
    set((s) => {
      const trigger = isTriggerType(nodeTypeId);
      // A workflow has at most one trigger; ignore a second one.
      if (trigger && s.nodes.some((n) => isTriggerType(n.type))) return {};
      const node: WfNode = {
        id: crypto.randomUUID(),
        type: nodeTypeId,
        position: { x: COLUMN_X, y: 0 },
        data: { config: defaultConfig(nodeTypeId) },
      };
      // Trigger pins to the top (Step 0); every other node appends below.
      const nodes = trigger ? [node, ...s.nodes] : [...s.nodes, node];
      return { nodes: relayout(nodes), selectedNodeId: node.id, dirty: true };
    }),

  moveNode: (id, direction) =>
    set((s) => {
      const i = s.nodes.findIndex((n) => n.id === id);
      if (i < 0) return {};
      const j = direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= s.nodes.length) return {};
      // Keep the trigger pinned: it never moves, and no step may cross above it.
      if (isTriggerType(s.nodes[i].type) || isTriggerType(s.nodes[j].type)) {
        return {};
      }
      const next = [...s.nodes];
      [next[i], next[j]] = [next[j], next[i]];
      return { nodes: relayout(next), dirty: true };
    }),

  updateNodeConfig: (nodeId, config) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config } } : n,
      ),
      dirty: true,
    })),

  setInputEdge: (target, targetHandle, source, sourceHandle) =>
    set((s) => {
      const kept = s.edges.filter(
        (e) => !(e.target === target && (e.targetHandle ?? null) === targetHandle),
      );
      const edge = presentEdge({
        id: crypto.randomUUID(),
        source,
        target,
        sourceHandle,
        targetHandle,
      });
      return { edges: [...kept, edge], dirty: true };
    }),

  clearInputEdge: (target, targetHandle) =>
    set((s) => ({
      edges: s.edges.filter(
        (e) => !(e.target === target && (e.targetHandle ?? null) === targetHandle),
      ),
      dirty: true,
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  removeNode: (id) =>
    set((s) => ({
      nodes: relayout(s.nodes.filter((n) => n.id !== id)),
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
