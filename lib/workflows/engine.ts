import { getNodeType } from "@/lib/nodes/registry";
import { isNodeTypeEnabled } from "@/lib/plugins/service";
import { getWorkflow } from "./service";
import { createRun, getRun, saveRunState } from "./runs-service";
import { incomingEdges, topoOrder } from "./graph";
import { resolveReferences } from "./references";
import type { NodeOutputs, NodeRunState, WorkflowGraph } from "./types";
import type { NodeRunContext, RunResult } from "@/lib/nodes/types";

/**
 * Workflow execution engine.
 *
 * `execute` walks the graph in topological order, resolving each node's inputs
 * from upstream outputs, and persists the run after every node so a pause is
 * durable and the UI can poll live. Already-"done" nodes are skipped, which is
 * what lets `resumeRun` continue downstream without recomputing anything.
 *
 * Execution is threaded through an injected {@link StepRunner} so a single engine
 * runs both synchronously (the default {@link inlineRunner}) and as a durable
 * Inngest job (the adapter in `lib/inngest/functions.ts` forwards to `step.run`).
 * Everything side-effectful — node `run`, every `createRun`/`saveRunState`, the
 * resume-token UUID — happens *inside* a step, so Inngest memoizes it and never
 * re-executes it on replay. The topo walk, input resolution and skip-`done` logic
 * stay *outside* steps: they are deterministic loop control that re-runs safely on
 * every replay, reconstructing local state from the memoized step results. The
 * engine never imports Inngest, so it stays queue-agnostic and unit-testable.
 */

/**
 * Runs one unit of side-effectful work under a stable `stepId`. The Inngest
 * adapter memoizes each id (the work runs once; its result is replayed
 * thereafter); the inline default just invokes `fn` immediately.
 */
export type StepRunner = <T>(stepId: string, fn: () => Promise<T>) => Promise<T>;

/** Default runner: run inline, no memoization. Keeps the engine queue-agnostic + testable. */
const inlineRunner: StepRunner = (_id, fn) => fn();

type LocalState = {
  nodeOutputs: Record<string, NodeOutputs>;
  nodeStates: Record<string, NodeRunState>;
};

/**
 * The JSON-serializable result of running a single node, returned from the
 * `node:<id>:run` step so it survives Inngest serialization/replay. (`pause`
 * carries only the node's stash state; the resume token is minted in the persist
 * step below.)
 */
type NodeOutcome =
  | { type: "output"; outputs: NodeOutputs }
  | { type: "pause"; state: Record<string, unknown> }
  | { type: "error"; error: string };

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

async function execute(
  runId: string,
  graph: WorkflowGraph,
  step: StepRunner = inlineRunner,
): Promise<void> {
  // Memoize the initial read so replays reconstruct progress from memoized step
  // results, not from a DB row that has since advanced.
  const run = await step("execute:load-run", () => getRun(runId));
  if (!run) return;

  const order = topoOrder(graph);
  if (!order) {
    await step("execute:cycle-error", () =>
      saveRunState(runId, {
        status: "error",
        error: "Workflow graph has a cycle",
      }),
    );
    return;
  }

  const state: LocalState = {
    nodeOutputs: { ...run.nodeOutputs },
    nodeStates: { ...run.nodeStates },
  };
  const trigger = run.trigger ?? {};

  for (const node of order) {
    if (state.nodeStates[node.id] === "done") continue;

    // Resolve refs, validate config, and run the node — all the expensive,
    // side-effectful work — inside one memoized step that returns a plain JSON
    // outcome. Splitting this from the persist below means the common transient
    // failure (the DB write) retries only the cheap persist, while the blob/
    // OpenAI work stays memoized and is never re-run.
    const outcome = await step(
      `node:${node.id}:run`,
      async (): Promise<NodeOutcome> => {
        const def = getNodeType(node.type);
        if (!def) {
          return { type: "error", error: `Unknown node type: ${node.type}` };
        }

        // A disabled plugin neutralizes its nodes, even mid-workflow.
        if (!(await isNodeTypeEnabled(node.type))) {
          return {
            type: "error",
            error: `Node "${def.label}" belongs to a disabled plugin`,
          };
        }

        try {
          // Substitute {{nodeId.path}} references from upstream outputs, then validate.
          const resolvedConfig = resolveReferences(
            node.config,
            state.nodeOutputs,
            trigger,
          );
          const config = def.configSchema.parse(resolvedConfig);
          const ctx: NodeRunContext = {
            config,
            inputs: resolveInputs(graph, node.id, state.nodeOutputs),
            trigger,
            runId,
            log: (msg) => console.log(`[run ${runId}][${node.id}] ${msg}`),
          };
          const result: RunResult = await def.run(ctx);
          return result.type === "pause"
            ? { type: "pause", state: result.state }
            : { type: "output", outputs: result.outputs };
        } catch (err) {
          return {
            type: "error",
            error: `${def.label}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    );

    if (outcome.type === "error") {
      state.nodeStates[node.id] = "error";
      await step(`node:${node.id}:persist`, () =>
        saveRunState(runId, {
          status: "error",
          nodeStates: state.nodeStates,
          error: outcome.error,
        }),
      );
      return;
    }

    if (outcome.type === "pause") {
      state.nodeStates[node.id] = "waiting";
      // Stash pause state (e.g. candidates) under this node's outputs for the UI.
      state.nodeOutputs[node.id] = outcome.state as NodeOutputs;
      await step(`node:${node.id}:persist`, () =>
        saveRunState(runId, {
          status: "waiting",
          nodeStates: state.nodeStates,
          nodeOutputs: state.nodeOutputs,
          waitingNodeId: node.id,
          // Minted inside the step so the token is memoized with the write.
          resumeToken: crypto.randomUUID(),
        }),
      );
      return;
    }

    state.nodeOutputs[node.id] = outcome.outputs;
    state.nodeStates[node.id] = "done";
    await step(`node:${node.id}:persist`, () =>
      saveRunState(runId, {
        nodeStates: state.nodeStates,
        nodeOutputs: state.nodeOutputs,
      }),
    );
  }

  await step("execute:finish", () => saveRunState(runId, { status: "success" }));
}

/**
 * Start a fresh run of a workflow with the given trigger payload. When
 * `triggerNodeId` is given (a Webhook node), its outputs are pre-seeded from the
 * payload and marked done, so downstream nodes resolve their inputs from it.
 */
export async function startRun(
  workflowId: string,
  trigger: Record<string, unknown>,
  triggerNodeId?: string,
  step: StepRunner = inlineRunner,
): Promise<string> {
  const workflow = await step("start:load-workflow", () =>
    getWorkflow(workflowId),
  );
  if (!workflow) throw new Error("Workflow not found");
  // Memoized so a replay reuses the same run row instead of creating a new one.
  const run = await step("start:create-run", () =>
    createRun(workflowId, trigger),
  );
  if (triggerNodeId) {
    await step("start:seed-trigger", () =>
      saveRunState(run.id, {
        nodeOutputs: { [triggerNodeId]: trigger as NodeOutputs },
        nodeStates: { [triggerNodeId]: "done" },
      }),
    );
  }
  await execute(run.id, workflow.graph as WorkflowGraph, step);
  return run.id;
}

/** Resume a paused run by supplying the human's chosen image, then continue. */
export async function resumeRun(
  runId: string,
  resumeToken: string,
  choiceUrl: string,
  step: StepRunner = inlineRunner,
): Promise<void> {
  // Distinct id from execute's own load so both reads memoize independently.
  const run = await step("resume:load-run", () => getRun(runId));
  if (!run) throw new Error("Run not found");
  if (run.status !== "waiting" || !run.waitingNodeId) {
    throw new Error("Run is not awaiting input");
  }
  if (!run.resumeToken || run.resumeToken !== resumeToken) {
    throw new Error("Invalid resume token");
  }

  const workflow = await step("resume:load-workflow", () =>
    getWorkflow(run.workflowId),
  );
  if (!workflow) throw new Error("Workflow not found");

  const nodeOutputs = { ...run.nodeOutputs };
  const nodeStates = { ...run.nodeStates };
  nodeOutputs[run.waitingNodeId] = { chosen: choiceUrl };
  nodeStates[run.waitingNodeId] = "done";

  await step("resume:apply-choice", () =>
    saveRunState(runId, {
      status: "running",
      nodeOutputs,
      nodeStates,
      waitingNodeId: null,
      resumeToken: null,
    }),
  );

  await execute(runId, workflow.graph as WorkflowGraph, step);
}
