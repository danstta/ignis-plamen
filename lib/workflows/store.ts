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
import { selectedOutputPaths } from "./references";
import { topoOrder } from "./graph";
import { ROUTER_TYPE_ID } from "./conditions";
import { laneNodes, layoutNodes } from "./editor-structure";
import type { BranchRef, WorkflowGraph, WorkflowNode } from "./types";

/**
 * xyflow node data. `config` + `branch` + `name` are persisted (the type id
 * lives on node.type); `step`/`laneFirst`/`laneLast` are transient view fields
 * recomputed by {@link layoutNodes} on every structural change and never saved.
 */
export type WfNodeData = {
  config: Record<string, unknown>;
  branch?: BranchRef;
  /** User-chosen step name; blank/absent = display the node type's label. */
  name?: string;
  step?: number;
  stepLabel?: string;
  laneFirst?: boolean;
  laneLast?: boolean;
};
export type WfNode = Node<WfNodeData>;

const COLUMN_X = 0;

/** A trigger node (e.g. Webhook) starts a workflow and is always Step 0. */
function isTriggerType(type: string | undefined): boolean {
  return !!type && getNodeMeta(type)?.category === "trigger";
}

/**
 * The step order for a loaded graph: trigger(s) first, then the remaining nodes
 * in execution (topological) order, so the visible Step numbers match the order
 * the engine actually runs them. Falls back to stored order if the graph has a
 * cycle (which the engine rejects anyway). Branch membership is preserved on the
 * nodes themselves, so {@link layoutNodes} regroups them into columns afterwards.
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

function sourceHandleFor(node: WfNode, edge: Edge): string | undefined {
  return edge.sourceHandle ?? getNodeMeta(node.type ?? "")?.outputs[0]?.id;
}

/** A fresh, empty branch for a router. */
function newBranch(label: string) {
  return { id: crypto.randomUUID(), label, left: "", op: "eq", right: "" };
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

  /** Append a step to the trunk (or pin a trigger to the top). One trigger max. */
  addNode: (nodeTypeId: string) => void;
  /** Append a step into one branch lane of a router. */
  addNodeToBranch: (
    nodeTypeId: string,
    routerId: string,
    branchId: string,
  ) => void;
  /** Add an empty branch to a router. */
  addRouterBranch: (routerId: string) => void;
  /** Remove a branch from a router, deleting every step in that lane. */
  removeRouterBranch: (routerId: string, branchId: string) => void;
  /** Reorder a step one slot up/down within its own lane; the trigger is pinned. */
  moveNode: (id: string, direction: "up" | "down") => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  /** Rename a step. A blank name reverts to the node type's label. */
  setNodeName: (nodeId: string, name: string) => void;
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
  if (nodeTypeId === ROUTER_TYPE_ID) {
    // A router is useless with no branches — seed one alongside the implicit Else.
    return { branches: [newBranch("Branch 1")] };
  }
  const meta = getNodeMeta(nodeTypeId);
  if (!meta) return {};
  const parsed = meta.configSchema.safeParse({});
  return parsed.success ? (parsed.data as Record<string, unknown>) : {};
}

function makeNode(nodeTypeId: string, branch?: BranchRef): WfNode {
  return {
    id: crypto.randomUUID(),
    type: nodeTypeId,
    position: { x: COLUMN_X, y: 0 },
    data: { config: defaultConfig(nodeTypeId), branch },
  };
}

function graphToFlow(graph: WorkflowGraph): { nodes: WfNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { config: n.config, branch: n.branch, name: n.name },
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
      nodes: layoutNodes(nodes),
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
      // Removal is handled by removeNode (it also prunes edges, cascades router
      // branches, and relayouts), so drop xyflow's own remove changes here.
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
        presentEdge({ ...connection, id: crypto.randomUUID() }),
        s.edges,
      ),
      dirty: true,
    })),

  addNode: (nodeTypeId) =>
    set((s) => {
      const trigger = isTriggerType(nodeTypeId);
      // Structured workflows must begin with a trigger.
      if (!trigger && !s.nodes.some((n) => isTriggerType(n.type))) return {};
      // A workflow has at most one trigger; ignore a second one.
      if (trigger && s.nodes.some((n) => isTriggerType(n.type))) return {};
      const node = makeNode(nodeTypeId);
      // Trigger pins to the top (Step 0); every other node appends below.
      const nodes = trigger ? [node, ...s.nodes] : [...s.nodes, node];
      return { nodes: layoutNodes(nodes), selectedNodeId: node.id, dirty: true };
    }),

  addNodeToBranch: (nodeTypeId, routerId, branchId) =>
    set((s) => {
      // Branch lanes can't hold triggers or (for now) nested routers.
      if (isTriggerType(nodeTypeId) || nodeTypeId === ROUTER_TYPE_ID) return {};
      const node = makeNode(nodeTypeId, { routerId, branchId });
      return {
        nodes: layoutNodes([...s.nodes, node]),
        selectedNodeId: node.id,
        dirty: true,
      };
    }),

  addRouterBranch: (routerId) =>
    set((s) => {
      const router = s.nodes.find((n) => n.id === routerId);
      if (!router || router.type !== ROUTER_TYPE_ID) return {};
      const branches =
        (router.data.config.branches as ReturnType<typeof newBranch>[]) ?? [];
      const nextConfig = {
        ...router.data.config,
        branches: [...branches, newBranch(`Branch ${branches.length + 1}`)],
      };
      const nodes = s.nodes.map((n) =>
        n.id === routerId ? { ...n, data: { ...n.data, config: nextConfig } } : n,
      );
      return { nodes: layoutNodes(nodes), dirty: true };
    }),

  removeRouterBranch: (routerId, branchId) =>
    set((s) => {
      const router = s.nodes.find((n) => n.id === routerId);
      if (!router || router.type !== ROUTER_TYPE_ID) return {};
      const branches =
        (router.data.config.branches as ReturnType<typeof newBranch>[]) ?? [];
      const nextConfig = {
        ...router.data.config,
        branches: branches.filter((b) => b.id !== branchId),
      };
      // Drop the router's updated config and every step that lived in the lane.
      const remaining = s.nodes
        .filter(
          (n) =>
            !(
              n.data.branch?.routerId === routerId &&
              n.data.branch.branchId === branchId
            ),
        )
        .map((n) =>
          n.id === routerId ? { ...n, data: { ...n.data, config: nextConfig } } : n,
        );
      return { nodes: layoutNodes(remaining), dirty: true };
    }),

  moveNode: (id, direction) =>
    set((s) => {
      const node = s.nodes.find((n) => n.id === id);
      if (!node) return {};
      const lane = laneNodes(s.nodes, node);
      const i = lane.findIndex((n) => n.id === id);
      const j = direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= lane.length) return {};
      // Keep the trigger pinned: it never moves, and no step may cross above it.
      if (isTriggerType(lane[i].type) || isTriggerType(lane[j].type)) return {};
      const fa = s.nodes.indexOf(lane[i]);
      const fb = s.nodes.indexOf(lane[j]);
      const next = [...s.nodes];
      [next[fa], next[fb]] = [next[fb], next[fa]];
      return { nodes: layoutNodes(next), dirty: true };
    }),

  setNodeName: (nodeId, name) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, name } } : n,
      ),
      dirty: true,
    })),

  updateNodeConfig: (nodeId, config) =>
    set((s) => {
      const sourceNode = s.nodes.find((n) => n.id === nodeId);
      const exposed = sourceNode
        ? new Set(
            selectedOutputPaths({
              id: sourceNode.id,
              type: sourceNode.type ?? "",
              config,
            }),
          )
        : null;
      const nodes = s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config } } : n,
      );
      const edges = exposed
        ? s.edges.filter((e) => {
            if (e.source !== nodeId || !sourceNode) return true;
            const sourceHandle = sourceHandleFor(sourceNode, e);
            return !!sourceHandle && exposed.has(sourceHandle);
          })
        : s.edges;
      return { nodes, edges, dirty: true };
    }),

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
    set((s) => {
      const target = s.nodes.find((n) => n.id === id);
      // Deleting a router takes its whole branch subtree with it.
      const removeIds = new Set<string>([id]);
      if (target?.type === ROUTER_TYPE_ID) {
        for (const n of s.nodes) {
          if (n.data.branch?.routerId === id) removeIds.add(n.id);
        }
      }
      return {
        nodes: layoutNodes(s.nodes.filter((n) => !removeIds.has(n.id))),
        edges: s.edges.filter(
          (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
        ),
        selectedNodeId: removeIds.has(s.selectedNodeId ?? "")
          ? null
          : s.selectedNodeId,
        dirty: true,
      };
    }),

  toGraph: () => {
    const { nodes, edges } = get();
    return {
      nodes: nodes.map((n) => {
        // Persist the trimmed name; a blank rename reverts to the type label.
        const name = n.data?.name?.trim();
        return {
          id: n.id,
          type: n.type ?? "",
          position: n.position,
          config: n.data?.config ?? {},
          ...(n.data?.branch ? { branch: n.data.branch } : {}),
          ...(name ? { name } : {}),
        };
      }),
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
