import { getNodeType } from "@/lib/nodes/registry";
import { isNodeTypeEnabled } from "@/lib/plugins/service";
import { ELSE_BRANCH_ID, ROUTER_TYPE_ID, branchSteps, orderLane, trunkSteps } from "./control-flow";
import { resolveInputs } from "./input-resolution";
import { resolveReferences } from "./references";
import type { NodeOutputs, WorkflowGraph, WorkflowNode } from "./types";
import type { NodeRunContext, RunResult } from "@/lib/nodes/types";

export type TestNodeStatus = "success" | "error" | "paused" | "skipped";

export type TestNodeResult = {
  nodeId: string;
  type: string;
  label: string;
  status: TestNodeStatus;
  inputs?: Record<string, unknown>;
  outputs?: NodeOutputs;
  error?: string;
  note?: string;
};

export type WorkflowTestResult = {
  status: "success" | "error" | "paused";
  targetNodeId?: string;
  nodes: TestNodeResult[];
};

type LocalState = {
  nodeOutputs: Record<string, NodeOutputs>;
  results: TestNodeResult[];
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultFor(node: WorkflowNode, status: TestNodeStatus): TestNodeResult {
  const def = getNodeType(node.type);
  return {
    nodeId: node.id,
    type: node.type,
    label: def?.label ?? node.type,
    status,
  };
}

async function runNode(
  graph: WorkflowGraph,
  node: WorkflowNode,
  state: LocalState,
  trigger: Record<string, unknown>,
  runId: string,
): Promise<"continue" | "stop"> {
  const def = getNodeType(node.type);
  if (!def) {
    state.results.push({
      ...resultFor(node, "error"),
      error: `Unknown node type: ${node.type}`,
    });
    return "stop";
  }

  if (!(await isNodeTypeEnabled(node.type))) {
    state.results.push({
      ...resultFor(node, "error"),
      error: `Node "${def.label}" belongs to a disabled plugin`,
    });
    return "stop";
  }

  const inputs = resolveInputs(graph, node.id, state.nodeOutputs);
  try {
    const resolvedConfig = resolveReferences(node.config, state.nodeOutputs, trigger);
    const config = def.configSchema.parse(resolvedConfig);
    const ctx: NodeRunContext = {
      config,
      rawConfig: node.config,
      inputs,
      trigger,
      runId,
      log: (msg) => console.log(`[test ${runId}][${node.id}] ${msg}`),
    };
    const outcome: RunResult = await def.run(ctx);
    if (outcome.type === "pause") {
      state.nodeOutputs[node.id] = outcome.state as NodeOutputs;
      state.results.push({
        ...resultFor(node, "paused"),
        inputs,
        outputs: state.nodeOutputs[node.id],
        note: outcome.reason,
      });
      return "stop";
    }

    state.nodeOutputs[node.id] = outcome.outputs;
    state.results.push({
      ...resultFor(node, "success"),
      inputs,
      outputs: outcome.outputs,
    });
    return "continue";
  } catch (error) {
    state.results.push({
      ...resultFor(node, "error"),
      inputs,
      error: `${def.label}: ${formatError(error)}`,
    });
    return "stop";
  }
}

export async function runWorkflowTest({
  graph,
  trigger,
  targetNodeId,
}: {
  graph: WorkflowGraph;
  trigger: Record<string, unknown>;
  targetNodeId?: string;
}): Promise<WorkflowTestResult> {
  const state: LocalState = { nodeOutputs: {}, results: [] };
  const runId = `test-${crypto.randomUUID()}`;
  let status: WorkflowTestResult["status"] = "success";
  let targetReached = false;

  async function executeNode(node: WorkflowNode): Promise<"continue" | "stop"> {
    const result = await runNode(graph, node, state, trigger, runId);
    const last = state.results[state.results.length - 1];
    if (last?.status === "error") status = "error";
    if (last?.status === "paused") status = "paused";
    if (node.id === targetNodeId) {
      targetReached = true;
      return "stop";
    }
    return result;
  }

  async function runSequence(steps: WorkflowNode[]): Promise<boolean> {
    for (let i = 0; i < steps.length; i++) {
      const node = steps[i];
      if ((await executeNode(node)) === "stop") return false;

      if (node.type === ROUTER_TYPE_ID) {
        const chosen =
          (state.nodeOutputs[node.id]?.branch as string | undefined) ??
          ELSE_BRANCH_ID;
        const routeMode =
          (state.nodeOutputs[node.id]?.routeMode as string | undefined) ??
          "branch";

        if (routeMode === "redoPrevious") {
          const redoTarget = steps[i - 1];
          if (!redoTarget) {
            state.results.push({
              ...resultFor(node, "error"),
              error: "Router cannot redo because there is no previous step.",
            });
            status = "error";
            return false;
          }
          if ((await executeNode(redoTarget)) === "stop") return false;
          if ((await executeNode(node)) === "stop") return false;
          continue;
        }

        const lane = orderLane(branchSteps(graph, node.id, chosen), graph.edges);
        if (!(await runSequence(lane))) return false;
      }
    }
    return true;
  }

  await runSequence(orderLane(trunkSteps(graph), graph.edges));

  if (targetNodeId && !targetReached && status === "success") {
    const target = graph.nodes.find((n) => n.id === targetNodeId);
    if (target) {
      state.results.push({
        ...resultFor(target, "skipped"),
        note: "This node was not reached by the sample event.",
      });
    }
  }

  return { status, targetNodeId, nodes: state.results };
}
