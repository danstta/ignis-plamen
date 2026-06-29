import { topoOrder } from "./graph";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./types";

/**
 * Control-flow lane helpers shared by the engine (server), the editor store, and
 * the config UI (client). Pure and client-safe — no DB/server imports.
 *
 * A workflow is a vertical "trunk" of steps. A {@link ROUTER_TYPE_ID} node fans
 * the flow out into ordered **branches** (parallel columns); each non-trunk step
 * carries the owning router id + branch id (see WorkflowNode.branch). At run time
 * the router evaluates its branch conditions top-to-bottom (first match wins) and
 * only the chosen branch's lane runs; flow then rejoins the trunk below.
 *
 * Condition primitives live in the dependency-free ./conditions leaf (re-exported
 * here for convenience); node metadata must import them from there, not from this
 * module, to avoid an import cycle through the node catalog.
 */
export * from "./conditions";

/** Top-level (trunk) steps — those not inside any branch — in stored order. */
export function trunkSteps(graph: WorkflowGraph): WorkflowNode[] {
  return graph.nodes.filter((n) => !n.branch);
}

/** Steps belonging to one branch lane of a router, in stored order. */
export function branchSteps(
  graph: WorkflowGraph,
  routerId: string,
  branchId: string,
): WorkflowNode[] {
  return graph.nodes.filter(
    (n) => n.branch?.routerId === routerId && n.branch.branchId === branchId,
  );
}

/**
 * A stable run order for one lane's steps: a topological sort over only the
 * data dependencies *within* the lane, falling back to stored order. Keeps
 * non-branching (legacy) workflows running exactly as the old whole-graph topo
 * sort did, while letting branch lanes order independently of the trunk.
 */
export function orderLane(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const within = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return topoOrder({ nodes, edges: within }) ?? nodes;
}
