import { getNodeType } from "@/lib/nodes/registry";
import { isNodeTypeEnabled } from "@/lib/plugins/service";
import { getWorkflow } from "./service";
import { createRun, getRun, saveRunState } from "./runs-service";
import {
  ELSE_BRANCH_ID,
  ROUTER_TYPE_ID,
  branchSteps,
  orderLane,
  trunkSteps,
} from "./control-flow";
import { resolveInputs } from "./input-resolution";
import { resolveReferences, validateLockedPaths } from "./references";
import type {
  NodeOutputs,
  NodeRunState,
  RunLogEntry,
  RunLogLevel,
  RunStatus,
  WorkflowGraph,
  WorkflowNode,
} from "./types";
import type { NodeRunContext, RunResult } from "@/lib/nodes/types";

/**
 * Workflow execution engine.
 *
 * `execute` walks the workflow as control flow: the trunk top-to-bottom, and at
 * each Router only the branch it chose (the other branches never run), rejoining
 * the trunk afterwards. Each node's inputs are resolved from upstream outputs, and
 * the run is persisted after every node so a pause is durable and the UI can poll
 * live. Already-"done" nodes are skipped, which is what lets `resumeRun` continue
 * downstream without recomputing anything; a router's recorded choice makes the
 * traversal identical on replay.
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
  nodeLogs: Record<string, RunLogEntry[]>;
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

async function execute(
  runId: string,
  graph: WorkflowGraph,
  step: StepRunner = inlineRunner,
): Promise<void> {
  // Memoize the initial read so replays reconstruct progress from memoized step
  // results, not from a DB row that has since advanced.
  const run = await step("execute:load-run", () => getRun(runId));
  if (!run) return;

  const state: LocalState = {
    nodeOutputs: { ...run.nodeOutputs },
    nodeStates: { ...run.nodeStates },
    nodeLogs: { ...(run.nodeLogs ?? {}) },
  };
  const trigger = run.trigger ?? {};
  const nodeVisitCounts: Record<string, number> = {};
  const redoCounts: Record<string, number> = {};
  let stopCheckCount = 0;

  const currentRunStatus = async (): Promise<RunStatus | null> => {
    const current = await step(`execute:stop-check:${stopCheckCount++}`, () =>
      getRun(runId),
    );
    return current?.status ?? null;
  };

  const visitStepId = (nodeId: string, phase: "run" | "persist") => {
    const visit = nodeVisitCounts[nodeId] ?? 1;
    return visit === 1
      ? `node:${nodeId}:${phase}`
      : `node:${nodeId}:${phase}:${visit}`;
  };

  const logNode = async (
    nodeId: string,
    message: string,
    level: RunLogLevel = "info",
  ) => {
    const entry: RunLogEntry = {
      id:
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    state.nodeLogs[nodeId] = [...(state.nodeLogs[nodeId] ?? []), entry].slice(
      -200,
    );
    console.log(`[run ${runId}][${nodeId}] ${message}`);
    try {
      await saveRunState(runId, { nodeLogs: state.nodeLogs });
    } catch (err) {
      console.warn(
        `[run ${runId}][${nodeId}] failed to persist log: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  // Resolve refs, validate config, and run one node — all the expensive,
  // side-effectful work — inside one memoized step that returns a plain JSON
  // outcome. Splitting this from the persist below means the common transient
  // failure (the DB write) retries only the cheap persist, while the blob/
  // OpenAI work stays memoized and is never re-run.
  const runNode = (node: WorkflowNode) => {
    nodeVisitCounts[node.id] = (nodeVisitCounts[node.id] ?? 0) + 1;
    return step(visitStepId(node.id, "run"), async (): Promise<NodeOutcome> => {
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
        state.nodeStates[node.id] = "running";
        await logNode(node.id, `Started ${def.label}.`);
        await saveRunState(runId, {
          nodeStates: state.nodeStates,
          nodeLogs: state.nodeLogs,
        });

        // Substitute {{nodeId.path}} references from upstream outputs, then validate.
        await logNode(node.id, "Resolving inputs and validating configuration.");
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
          log: (msg) => logNode(node.id, msg),
        };
        const result: RunResult = await def.run(ctx);
        await logNode(
          node.id,
          result.type === "pause"
            ? "Paused for human input."
            : "Completed successfully.",
        );
        return result.type === "pause"
          ? { type: "pause", state: result.state }
          : { type: "output", outputs: result.outputs };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logNode(node.id, message, "error");
        return {
          type: "error",
          error: `${def.label}: ${message}`,
        };
      }
    });
  };

  const persistNodeOutcome = async (
    node: WorkflowNode,
    outcome: NodeOutcome,
  ): Promise<"continue" | "stop"> => {
    if ((await currentRunStatus()) === "stopped") {
      return "stop";
    }

    if (outcome.type === "error") {
      state.nodeStates[node.id] = "error";
      await step(visitStepId(node.id, "persist"), () =>
        saveRunState(runId, {
          status: "error",
          nodeStates: state.nodeStates,
          nodeLogs: state.nodeLogs,
          error: outcome.error,
        }),
      );
      return "stop";
    }

    if (outcome.type === "pause") {
      state.nodeStates[node.id] = "waiting";
      // Stash pause state (e.g. candidates) under this node's outputs for the UI.
      state.nodeOutputs[node.id] = {
        ...outcome.state,
        reviewUrl: `/workflows/${run.workflowId}/runs/${runId}`,
      } as NodeOutputs;
      await step(visitStepId(node.id, "persist"), () =>
        saveRunState(runId, {
          status: "waiting",
          nodeStates: state.nodeStates,
          nodeOutputs: state.nodeOutputs,
          nodeLogs: state.nodeLogs,
          waitingNodeId: node.id,
          // Minted inside the step so the token is memoized with the write.
          resumeToken: crypto.randomUUID(),
        }),
      );
      return "stop";
    }

    state.nodeOutputs[node.id] = outcome.outputs;
    state.nodeStates[node.id] = "done";
    await step(visitStepId(node.id, "persist"), () =>
      saveRunState(runId, {
        nodeStates: state.nodeStates,
        nodeOutputs: state.nodeOutputs,
        nodeLogs: state.nodeLogs,
      }),
    );
    return "continue";
  };

  const executeNode = async (
    node: WorkflowNode,
    options: { force?: boolean } = {},
  ): Promise<"continue" | "stop"> => {
    if ((await currentRunStatus()) === "stopped") {
      return "stop";
    }
    if (!options.force && state.nodeStates[node.id] === "done") {
      return "continue";
    }
    return persistNodeOutcome(node, await runNode(node));
  };

  /**
   * Run a lane of steps in order. After a router runs (or, on resume, is already
   * done), recurse into *only* the branch it chose, then continue this lane —
   * which is the rejoin. Returns false when the run errored or paused so callers
   * unwind and stop. The branch choice is read from the router's persisted
   * output, so traversal is identical on the first pass and on every replay.
   */
  async function runSequence(steps: WorkflowNode[]): Promise<boolean> {
    for (let i = 0; i < steps.length; i++) {
      const node = steps[i];
      if ((await executeNode(node)) === "stop") return false;

      if (node.type === ROUTER_TYPE_ID) {
        while (true) {
          const chosen =
            (state.nodeOutputs[node.id]?.branch as string | undefined) ??
            ELSE_BRANCH_ID;
          const routeMode =
            (state.nodeOutputs[node.id]?.routeMode as string | undefined) ??
            "branch";
          const maxAttemptsRaw = state.nodeOutputs[node.id]?.maxAttempts;
          const maxAttempts =
            typeof maxAttemptsRaw === "number" && Number.isFinite(maxAttemptsRaw)
              ? Math.max(1, Math.min(10, Math.trunc(maxAttemptsRaw)))
              : 3;

          if (routeMode === "redoPrevious") {
            const redoTarget = steps[i - 1];
            const redoDef = redoTarget ? getNodeType(redoTarget.type) : undefined;
            if (!redoTarget || redoDef?.category === "trigger") {
              state.nodeStates[node.id] = "error";
              await step(`router:${node.id}:redo-target-error`, () =>
                saveRunState(runId, {
                  status: "error",
                  nodeStates: state.nodeStates,
                  error: "Router cannot redo because there is no previous non-trigger step.",
                }),
              );
              return false;
            }

            const key = `${node.id}:${chosen}`;
            redoCounts[key] = (redoCounts[key] ?? 0) + 1;
            if (redoCounts[key] > maxAttempts) {
              state.nodeStates[node.id] = "error";
              await step(`router:${node.id}:redo-limit:${chosen}`, () =>
                saveRunState(runId, {
                  status: "error",
                  nodeStates: state.nodeStates,
                  error: `Router exceeded ${maxAttempts} redo attempt(s) for "${redoDef?.label ?? redoTarget.type}".`,
                }),
              );
              return false;
            }

            if ((await executeNode(redoTarget, { force: true })) === "stop") {
              return false;
            }
            if ((await executeNode(node, { force: true })) === "stop") {
              return false;
            }
            continue;
          }

          const lane = orderLane(branchSteps(graph, node.id, chosen), graph.edges);
          if (!(await runSequence(lane))) return false;
          break;
        }
      }
    }
    return true;
  }

  const finished = await runSequence(
    orderLane(trunkSteps(graph), graph.edges),
  );
  if (!finished) return;
  if ((await currentRunStatus()) === "stopped") return;

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
    // The trigger node's selected fields are its locked-in contract. Fail the run
    // up-front — naming the missing paths — when an inbound payload lacks them,
    // rather than letting downstream nodes silently render blanks. Wildcards mean
    // this holds for any new request of the same shape, not just the captured one.
    const graph = workflow.graph as WorkflowGraph;
    const triggerNode = graph.nodes.find((n) => n.id === triggerNodeId);
    const locked = triggerNode?.config?.selectedFields;
    const missing = Array.isArray(locked)
      ? validateLockedPaths(trigger, locked as string[])
      : [];
    if (missing.length > 0) {
      await step("start:trigger-validation", () =>
        saveRunState(run.id, {
          status: "error",
          nodeStates: { [triggerNodeId]: "error" },
          error: `Webhook payload is missing expected field(s): ${missing.join(", ")}`,
        }),
      );
      return run.id;
    }
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

type ResumeChoice =
  | { choiceUrl: string }
  | { selectedUrls: string[] };

function isImageRecord(value: unknown): value is { url: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "url" in value &&
    typeof value.url === "string"
  );
}

function isPlaceholderRecord(
  value: unknown,
): value is { key: string; kind: "text" | "image" } {
  return (
    value !== null &&
    typeof value === "object" &&
    "key" in value &&
    typeof value.key === "string" &&
    "kind" in value &&
    (value.kind === "text" || value.kind === "image")
  );
}

function valueToOutputText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(valueToOutputText).join(", ");
  return JSON.stringify(value);
}

function templateDataForCuratedImages(
  pausedState: NodeOutputs | undefined,
  selectedUrls: string[],
): Record<string, string> {
  const placeholders = Array.isArray(pausedState?.previewPlaceholders)
    ? pausedState.previewPlaceholders.filter(isPlaceholderRecord)
    : [];
  const bindings =
    pausedState?.previewBindings &&
    typeof pausedState.previewBindings === "object" &&
    !Array.isArray(pausedState.previewBindings)
      ? (pausedState.previewBindings as Record<string, unknown>)
      : {};
  const data: Record<string, string> = {};
  let imageIndex = 0;

  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    const value =
      bound !== undefined && bound !== "" ? valueToOutputText(bound) : "";
    if (placeholder.kind === "image") {
      data[placeholder.key] = value || selectedUrls[imageIndex] || "";
      imageIndex += 1;
    } else {
      data[placeholder.key] = value;
    }
  }
  return data;
}

function outputForCuratedImages(
  pausedState: NodeOutputs | undefined,
  selectedUrls: string[],
): NodeOutputs {
  const ranked = Array.isArray(pausedState?.ranked)
    ? pausedState.ranked.filter(isImageRecord)
    : Array.isArray(pausedState?.candidates)
      ? pausedState.candidates.filter(isImageRecord)
      : [];
  const byUrl = new Map(ranked.map((candidate) => [candidate.url, candidate]));
  const seen = new Set<string>();
  const selected = selectedUrls.flatMap((url) => {
    if (seen.has(url)) return [];
    const candidate = byUrl.get(url);
    if (!candidate) return [];
    seen.add(url);
    return [candidate];
  });
  const selectedSet = new Set(selected.map((candidate) => candidate.url));
  const curatedRanked = [
    ...selected,
    ...ranked.filter((candidate) => !selectedSet.has(candidate.url)),
  ];

  return {
    ranked: curatedRanked,
    selected,
    selectedUrls: selected.map((candidate) => candidate.url),
    templateData: templateDataForCuratedImages(
      pausedState,
      selected.map((candidate) => candidate.url),
    ),
    best: selected[0]?.url ?? "",
  };
}

function outputForHumanChoice(
  pausedState: NodeOutputs | undefined,
  choice: ResumeChoice,
): NodeOutputs {
  if ("selectedUrls" in choice) {
    return outputForCuratedImages(pausedState, choice.selectedUrls);
  }

  const choiceUrl = choice.choiceUrl;
  const candidates = pausedState?.candidates;
  const chosenDesign = Array.isArray(candidates)
    ? candidates.find(
        (candidate) =>
          candidate &&
          typeof candidate === "object" &&
          "url" in candidate &&
          candidate.url === choiceUrl,
      )
    : undefined;
  return {
    chosen: choiceUrl,
    ...(chosenDesign ? { chosenDesign } : {}),
  };
}

/** Resume a paused run by supplying the human's chosen item, then continue. */
export async function resumeRun(
  runId: string,
  resumeToken: string,
  choice: ResumeChoice,
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
  nodeOutputs[run.waitingNodeId] = outputForHumanChoice(
    run.nodeOutputs[run.waitingNodeId],
    choice,
  );
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
