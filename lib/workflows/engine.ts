import { getNodeType } from "@/lib/nodes/registry";
import { isNodeTypeEnabled } from "@/lib/plugins/service";
import { getWorkflow } from "./service";
import { createRun, getRun, saveRunState } from "./runs-service";
import { incomingEdges, topoOrder } from "./graph";
import type { NodeOutputs, NodeRunState, WorkflowGraph } from "./types";
import type { NodeRunContext, RunResult } from "@/lib/nodes/types";

/**
 * Synchronous, in-process workflow execution.
 *
 * `execute` walks the graph in topological order, resolving each node's inputs
 * from upstream outputs, and persists the run after every node so a pause is
 * durable and the UI can poll live. Already-"done" nodes are skipped, which is
 * what lets `resumeRun` continue downstream without recomputing anything.
 */

type LocalState = {
  nodeOutputs: Record<string, NodeOutputs>;
  nodeStates: Record<string, NodeRunState>;
};

/** Resolve a node's input values from the outputs of its upstream neighbours. */
function resolveInputs(
  graph: WorkflowGraph,
  nodeId: string,
  outputs: Record<string, NodeOutputs>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const edge of incomingEdges(graph, nodeId)) {
    const sourceDef = getNodeType(
      graph.nodes.find((n) => n.id === edge.source)?.type ?? "",
    );
    const targetDef = getNodeType(
      graph.nodes.find((n) => n.id === nodeId)?.type ?? "",
    );
    const sourceHandle = edge.sourceHandle ?? sourceDef?.outputs[0]?.id;
    const targetHandle = edge.targetHandle ?? targetDef?.inputs[0]?.id;
    if (!sourceHandle || !targetHandle) continue;
    inputs[targetHandle] = outputs[edge.source]?.[sourceHandle];
  }
  return inputs;
}

async function execute(runId: string, graph: WorkflowGraph): Promise<void> {
  const run = await getRun(runId);
  if (!run) return;

  const order = topoOrder(graph);
  if (!order) {
    await saveRunState(runId, {
      status: "error",
      error: "Workflow graph has a cycle",
    });
    return;
  }

  const state: LocalState = {
    nodeOutputs: { ...run.nodeOutputs },
    nodeStates: { ...run.nodeStates },
  };
  const trigger = run.trigger ?? {};

  for (const node of order) {
    if (state.nodeStates[node.id] === "done") continue;

    const def = getNodeType(node.type);
    if (!def) {
      state.nodeStates[node.id] = "error";
      await saveRunState(runId, {
        status: "error",
        nodeStates: state.nodeStates,
        error: `Unknown node type: ${node.type}`,
      });
      return;
    }

    // A disabled plugin neutralizes its nodes, even mid-workflow.
    if (!(await isNodeTypeEnabled(node.type))) {
      state.nodeStates[node.id] = "error";
      await saveRunState(runId, {
        status: "error",
        nodeStates: state.nodeStates,
        error: `Node "${def.label}" belongs to a disabled plugin`,
      });
      return;
    }

    state.nodeStates[node.id] = "running";
    await saveRunState(runId, { nodeStates: state.nodeStates });

    let result: RunResult;
    try {
      const config = def.configSchema.parse(node.config);
      const ctx: NodeRunContext = {
        config,
        inputs: resolveInputs(graph, node.id, state.nodeOutputs),
        trigger,
        runId,
        log: (msg) => console.log(`[run ${runId}][${node.id}] ${msg}`),
      };
      result = await def.run(ctx);
    } catch (err) {
      state.nodeStates[node.id] = "error";
      await saveRunState(runId, {
        status: "error",
        nodeStates: state.nodeStates,
        error: `${def.label}: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (result.type === "pause") {
      const resumeToken = crypto.randomUUID();
      state.nodeStates[node.id] = "waiting";
      // Stash pause state (e.g. candidates) under this node's outputs for the UI.
      state.nodeOutputs[node.id] = result.state as NodeOutputs;
      await saveRunState(runId, {
        status: "waiting",
        nodeStates: state.nodeStates,
        nodeOutputs: state.nodeOutputs,
        waitingNodeId: node.id,
        resumeToken,
      });
      return;
    }

    state.nodeOutputs[node.id] = result.outputs;
    state.nodeStates[node.id] = "done";
    await saveRunState(runId, {
      nodeStates: state.nodeStates,
      nodeOutputs: state.nodeOutputs,
    });
  }

  await saveRunState(runId, { status: "success" });
}

/** Start a fresh run of a workflow with the given trigger payload. */
export async function startRun(
  workflowId: string,
  trigger: Record<string, unknown>,
): Promise<string> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error("Workflow not found");
  const run = await createRun(workflowId, trigger);
  await execute(run.id, workflow.graph as WorkflowGraph);
  return run.id;
}

/** Resume a paused run by supplying the human's chosen image, then continue. */
export async function resumeRun(
  runId: string,
  resumeToken: string,
  choiceUrl: string,
): Promise<void> {
  const run = await getRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "waiting" || !run.waitingNodeId) {
    throw new Error("Run is not awaiting input");
  }
  if (!run.resumeToken || run.resumeToken !== resumeToken) {
    throw new Error("Invalid resume token");
  }

  const workflow = await getWorkflow(run.workflowId);
  if (!workflow) throw new Error("Workflow not found");

  const nodeOutputs = { ...run.nodeOutputs };
  const nodeStates = { ...run.nodeStates };
  nodeOutputs[run.waitingNodeId] = { chosen: choiceUrl };
  nodeStates[run.waitingNodeId] = "done";

  await saveRunState(runId, {
    status: "running",
    nodeOutputs,
    nodeStates,
    waitingNodeId: null,
    resumeToken: null,
  });

  await execute(runId, workflow.graph as WorkflowGraph);
}
