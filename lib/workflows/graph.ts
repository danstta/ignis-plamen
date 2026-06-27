import { referencedNodeIds } from "./references";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./types";

/** Edges arriving at `nodeId`. */
export function incomingEdges(
  graph: WorkflowGraph,
  nodeId: string,
): WorkflowEdge[] {
  return graph.edges.filter((e) => e.target === nodeId);
}

/** Edges leaving `nodeId`. */
export function outgoingEdges(
  graph: WorkflowGraph,
  nodeId: string,
): WorkflowEdge[] {
  return graph.edges.filter((e) => e.source === nodeId);
}

/**
 * Dependency edges that govern execution order: explicit wired edges plus
 * implicit ones derived from `{{nodeId.path}}` tokens in node configs. A node
 * that only references upstream data by token (no wire) still depends on the
 * referenced node. Deduped to `source->target` so indegree stays accurate.
 */
function dependencyEdges(graph: WorkflowGraph): { source: string; target: string }[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: { source: string; target: string }[] = [];
  const add = (source: string, target: string) => {
    if (source === target || !ids.has(source) || !ids.has(target)) return;
    const key = `${source}->${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target });
  };
  for (const e of graph.edges) add(e.source, e.target);
  for (const n of graph.nodes) {
    for (const dep of referencedNodeIds(n.config)) add(dep, n.id);
  }
  return edges;
}

/**
 * Kahn's algorithm over the combined dependency edges. Returns nodes in a valid
 * execution order, or null if there is a cycle (so callers can reject it).
 */
export function topoOrder(graph: WorkflowGraph): WorkflowNode[] | null {
  const deps = dependencyEdges(graph);
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of graph.nodes) {
    indegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const e of deps) {
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    adjacency.get(e.source)!.push(e.target);
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const queue = graph.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0);
  const order: WorkflowNode[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const target of adjacency.get(node.id) ?? []) {
      const dec = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, dec);
      if (dec === 0) {
        const n = byId.get(target);
        if (n) queue.push(n);
      }
    }
  }

  return order.length === graph.nodes.length ? order : null;
}

export function hasCycle(graph: WorkflowGraph): boolean {
  return topoOrder(graph) === null;
}
