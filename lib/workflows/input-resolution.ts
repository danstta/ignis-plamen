import { getNodeType } from "@/lib/nodes/registry";
import { incomingEdges } from "./graph";
import { resolvePathMatches } from "./references";
import type { NodeOutputs, WorkflowGraph } from "./types";

function firstOutputHandle(graph: WorkflowGraph, nodeId: string): string | undefined {
  const sourceDef = getNodeType(
    graph.nodes.find((n) => n.id === nodeId)?.type ?? "",
  );
  return sourceDef?.outputs[0]?.id;
}

/**
 * Resolve a stored edge source handle against a source node's outputs. Handles
 * are normally output port ids, but webhook sample fields are structural dot
 * paths such as `body.items.*.name`.
 */
export function resolveOutputHandle(
  outputs: Record<string, NodeOutputs>,
  sourceNodeId: string,
  sourceHandle: string | undefined,
): unknown {
  if (!sourceHandle) return undefined;
  const sourceOutputs = outputs[sourceNodeId] ?? {};
  if (Object.hasOwn(sourceOutputs, sourceHandle)) {
    return sourceOutputs[sourceHandle];
  }
  const matches = resolvePathMatches(sourceOutputs, sourceHandle.split("."));
  return matches.length === 0
    ? undefined
    : matches.length === 1
      ? matches[0]
      : matches;
}

/** Resolve a node's input values from outputs connected by incoming edges. */
export function resolveInputs(
  graph: WorkflowGraph,
  nodeId: string,
  outputs: Record<string, NodeOutputs>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  const targetDef = getNodeType(
    graph.nodes.find((n) => n.id === nodeId)?.type ?? "",
  );

  for (const edge of incomingEdges(graph, nodeId)) {
    const sourceHandle =
      edge.sourceHandle ?? firstOutputHandle(graph, edge.source);
    const targetHandle = edge.targetHandle ?? targetDef?.inputs[0]?.id;
    if (!sourceHandle || !targetHandle) continue;
    inputs[targetHandle] = resolveOutputHandle(
      outputs,
      edge.source,
      sourceHandle,
    );
  }

  return inputs;
}
