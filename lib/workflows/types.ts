/**
 * Workflow graph model. This is the single source of truth persisted on
 * `workflows.graph` and round-tripped to the @xyflow/react canvas. The shapes are
 * a deliberate subset of xyflow's Node/Edge so canvas <-> storage is near 1:1.
 */

/** A node placed on the workflow canvas. `type` is a node-type id from lib/nodes. */
export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  /** Per-node configuration, validated by the node type's configSchema at run time. */
  config: Record<string, unknown>;
}

/** A directed connection between two node ports. */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** Output port id on the source node (null/undefined = first output). */
  sourceHandle?: string | null;
  /** Input port id on the target node (null/undefined = first input). */
  targetHandle?: string | null;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export function emptyGraph(): WorkflowGraph {
  return { nodes: [], edges: [] };
}

/** Per-node lifecycle state, surfaced in the run-detail UI. */
export type NodeRunState =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "waiting";

/** Resolved outputs of a node, keyed by output port id. */
export type NodeOutputs = Record<string, unknown>;

/** Run status. `waiting` = paused on a Manual Review node for human input. */
export type RunStatus = "running" | "waiting" | "success" | "error";
