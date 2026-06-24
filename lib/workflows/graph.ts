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
 * Kahn's algorithm. Returns nodes in a valid execution order, or null if the
 * graph contains a cycle (so callers can reject it).
 */
export function topoOrder(graph: WorkflowGraph): WorkflowNode[] | null {
  const indegree = new Map<string, number>();
  for (const n of graph.nodes) indegree.set(n.id, 0);
  for (const e of graph.edges) {
    if (indegree.has(e.target)) {
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    }
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const queue = graph.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0);
  const order: WorkflowNode[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const e of outgoingEdges(graph, node.id)) {
      const next = indegree.get(e.target);
      if (next === undefined) continue;
      const dec = next - 1;
      indegree.set(e.target, dec);
      if (dec === 0) {
        const n = byId.get(e.target);
        if (n) queue.push(n);
      }
    }
  }

  return order.length === graph.nodes.length ? order : null;
}

export function hasCycle(graph: WorkflowGraph): boolean {
  return topoOrder(graph) === null;
}
