import { nodeDisplayLabel } from "@/lib/nodes/catalog";
import { getNodeType } from "@/lib/nodes/registry";
import { normalizeImageCandidates } from "@/lib/nodes/image-input";
import { enabledNodeTypeIds } from "@/lib/plugins/service";
import { getWorkflow } from "./service";
import {
  appendRunLog,
  createRun,
  getRun,
  getRunStatus,
  saveRunState,
  transitionRunState,
} from "./runs-service";
import {
  ELSE_BRANCH_ID,
  ROUTER_TYPE_ID,
  branchSteps,
  orderLane,
  trunkSteps,
} from "./control-flow";
import { resolveInputs } from "./input-resolution";
import { resolveReferences, validateLockedPaths } from "./references";
import {
  isPlaceholderImageValue,
  placeholderValueToText,
  toListItems,
  type PlaceholderData,
  type PlaceholderDescriptor,
  type PlaceholderImageValue,
  type PlaceholderValue,
} from "@/lib/editor/types";
import type {
  NodeOutputs,
  NodeRunState,
  RunLogLevel,
  RunStatus,
  WorkflowGraph,
  WorkflowNode,
} from "./types";
import type {
  NodeRunContext,
  NodeStepRunner,
  RunResult,
} from "@/lib/nodes/types";

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
  | { type: "stopped" }
  | { type: "error"; error: string };

class RunStoppedError extends Error {
  constructor() {
    super("Run stopped");
  }
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

  // Plugin state is static for a run's duration — load the enabled set once
  // instead of one query per node. Memoized so replays reuse the snapshot from
  // the first execution: toggles apply to new runs, not mid-run, including
  // across retries/resumes. Stored as an array — step results round-trip
  // through JSON, which a Set does not survive.
  const enabledNodeTypes = new Set(
    await step("execute:enabled-node-types", async () => [
      ...(await enabledNodeTypeIds()),
    ]),
  );

  const state: LocalState = {
    nodeOutputs: { ...run.nodeOutputs },
    nodeStates: { ...run.nodeStates },
  };
  const trigger = run.trigger ?? {};
  const nodeVisitCounts: Record<string, number> = {};
  const redoCounts: Record<string, number> = {};
  /** Per-(node, visit) log entry counter — deterministic on replay. */
  const logSeqCounts: Record<string, number> = {};

  const currentRunStatus = async (): Promise<RunStatus | null> =>
    getRunStatus(runId);

  const isStopped = async () => (await currentRunStatus()) === "stopped";
  const throwIfStopped = async () => {
    if (await isStopped()) throw new RunStoppedError();
  };

  const visitStepId = (nodeId: string, phase: "run" | "persist") => {
    const visit = nodeVisitCounts[nodeId] ?? 1;
    return visit === 1
      ? `node:${nodeId}:${phase}`
      : `node:${nodeId}:${phase}:${visit}`;
  };

  // Deliberately NOT step-wrapped: logNode is called from inside node `run()`
  // steps (nested steps are forbidden). Replay safety comes from the insert
  // being idempotent by its deterministic (runId, nodeId, visit, seq) key.
  const logNode = async (
    nodeId: string,
    message: string,
    level: RunLogLevel = "info",
  ) => {
    console.log(`[run ${runId}][${nodeId}] ${message}`);
    const visit = nodeVisitCounts[nodeId] ?? 1;
    const key = `${nodeId}:${visit}`;
    const seq = (logSeqCounts[key] = (logSeqCounts[key] ?? 0) + 1);
    try {
      await appendRunLog({ runId, nodeId, visit, seq, level, message });
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
  const cleanStepSegment = (value: string) =>
    value.replace(/[^a-zA-Z0-9:._-]/g, "_").slice(0, 160);

  const runNodeWork = async (
    node: WorkflowNode,
    substep?: NodeStepRunner,
  ): Promise<NodeOutcome> => {
    const smallStep: NodeStepRunner = substep ?? ((_id, fn) => fn());
    const def = getNodeType(node.type);
    if (!def) {
      return { type: "error", error: `Unknown node type: ${node.type}` };
    }

    // def.id is canonical even when node.type is a legacy alias.
    if (!enabledNodeTypes.has(def.id)) {
      return {
        type: "error",
        error: `Node "${nodeDisplayLabel(node)}" belongs to a disabled plugin`,
      };
    }

    try {
      state.nodeStates[node.id] = "running";
      await smallStep("start", async () => {
        await logNode(node.id, `Started ${nodeDisplayLabel(node)}.`);
        await throwIfStopped();
        await saveRunState(runId, {
          nodeStates: state.nodeStates,
        });
        return null;
      });

      await smallStep("resolve", async () => {
        await logNode(node.id, "Resolving inputs and validating configuration.");
        await throwIfStopped();
        return null;
      });
      const resolvedConfig = resolveReferences(
        node.config,
        state.nodeOutputs,
        trigger,
      );
      const config = def.configSchema.parse(resolvedConfig);
      const ctx: NodeRunContext = {
        nodeId: node.id,
        config,
        rawConfig: node.config,
        inputs: resolveInputs(graph, node.id, state.nodeOutputs),
        trigger,
        runId,
        log: (msg) => logNode(node.id, msg),
        isStopped,
        throwIfStopped,
        step: substep,
      };
      const result: RunResult = await def.run(ctx);
      await throwIfStopped();
      await smallStep("complete", async () => {
        await logNode(
          node.id,
          result.type === "pause"
            ? "Paused for human input."
            : "Completed successfully.",
        );
        return null;
      });
      return result.type === "pause"
        ? { type: "pause", state: result.state }
        : { type: "output", outputs: result.outputs };
    } catch (err) {
      if (err instanceof RunStoppedError) {
        await smallStep("stopped", async () => {
          await logNode(node.id, "Stopped by user.");
          return null;
        });
        return { type: "stopped" };
      }
      const message = err instanceof Error ? err.message : String(err);
      await smallStep("error", async () => {
        await logNode(node.id, message, "error");
        return null;
      });
      return {
        type: "error",
        error: `${nodeDisplayLabel(node)}: ${message}`,
      };
    }
  };

  const runNode = (node: WorkflowNode) => {
    nodeVisitCounts[node.id] = (nodeVisitCounts[node.id] ?? 0) + 1;
    const def = getNodeType(node.type);
    const runStepId = visitStepId(node.id, "run");
    if (def?.usesDurableSteps) {
      const substep: NodeStepRunner = (id, fn) =>
        step(`${runStepId}:sub:${cleanStepSegment(id)}`, fn);
      return runNodeWork(node, substep);
    }
    return step(runStepId, () => runNodeWork(node));
  };

  const persistNodeOutcome = async (
    node: WorkflowNode,
    outcome: NodeOutcome,
  ): Promise<"continue" | "stop"> => {
    if ((await currentRunStatus()) === "stopped") {
      return "stop";
    }

    if (outcome.type === "stopped") {
      return "stop";
    }

    if (outcome.type === "error") {
      state.nodeStates[node.id] = "error";
      await step(visitStepId(node.id, "persist"), () =>
        transitionRunState(runId, ["running", "waiting"], {
          status: "error",
          nodeStates: state.nodeStates,
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
      // A null transition means a concurrent stop won while the node was
      // pausing — either way the walk unwinds here.
      await step(visitStepId(node.id, "persist"), () =>
        transitionRunState(runId, ["running"], {
          status: "waiting",
          nodeStates: state.nodeStates,
          nodeOutputs: state.nodeOutputs,
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
                transitionRunState(runId, ["running", "waiting"], {
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
                transitionRunState(runId, ["running", "waiting"], {
                  status: "error",
                  nodeStates: state.nodeStates,
                  error: `Router exceeded ${maxAttempts} redo attempt(s) for "${nodeDisplayLabel(redoTarget)}".`,
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

  // Guarded transition: if a stop landed after the last node persisted, the
  // update matches zero rows and the stop is preserved.
  await step("execute:finish", () =>
    transitionRunState(runId, ["running"], { status: "success" }),
  );
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
        transitionRunState(run.id, ["running"], {
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
  | { choiceUrl: string; objectPosition?: string; scale?: number }
  | { selectedUrls: string[] }
  | { selectedImages: SelectedImageChoice[] };

type SelectedImageChoice = {
  url: string;
  objectPosition?: string;
  scale?: number;
};

function isPlaceholderRecord(value: unknown): value is PlaceholderDescriptor {
  return (
    value !== null &&
    typeof value === "object" &&
    "key" in value &&
    typeof value.key === "string" &&
    "kind" in value &&
    (value.kind === "text" || value.kind === "image" || value.kind === "list")
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

function valueForImagePlaceholder(value: unknown): PlaceholderValue {
  if (isPlaceholderImageValue(value)) return value;
  if (typeof value === "string") return value;
  return value !== undefined && value !== "" ? valueToOutputText(value) : "";
}

function valueForTextPlaceholder(value: unknown): string {
  if (isPlaceholderImageValue(value) || typeof value === "string") {
    return placeholderValueToText(value);
  }
  return value !== undefined && value !== "" ? valueToOutputText(value) : "";
}

function normalizeImageScale(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(4, Math.max(1, value));
}

function imageChoiceToPlaceholderValue(
  choice: SelectedImageChoice | undefined,
): PlaceholderValue {
  if (!choice?.url) return "";
  const scale = normalizeImageScale(choice.scale);
  const objectPosition = choice.objectPosition?.trim();
  const hasCustomPosition =
    !!objectPosition && objectPosition !== "center center";
  const hasCustomScale = scale !== undefined && scale !== 1;
  if (!hasCustomPosition && !hasCustomScale) return choice.url;

  const value: PlaceholderImageValue = { url: choice.url };
  if (hasCustomPosition) value.objectPosition = objectPosition;
  if (hasCustomScale) value.scale = scale;
  return value;
}

function templateDataForCuratedImages(
  pausedState: NodeOutputs | undefined,
  selectedImages: SelectedImageChoice[],
): PlaceholderData {
  const placeholders = Array.isArray(pausedState?.previewPlaceholders)
    ? pausedState.previewPlaceholders.filter(isPlaceholderRecord)
    : [];
  const bindings =
    pausedState?.previewBindings &&
    typeof pausedState.previewBindings === "object" &&
    !Array.isArray(pausedState.previewBindings)
      ? (pausedState.previewBindings as Record<string, unknown>)
      : {};
  const data: PlaceholderData = {};
  let imageIndex = 0;

  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    if (placeholder.kind === "image") {
      const value = valueForImagePlaceholder(bound);
      data[placeholder.key] =
        value || imageChoiceToPlaceholderValue(selectedImages[imageIndex]);
      imageIndex += 1;
    } else if (placeholder.kind === "list") {
      data[placeholder.key] = toListItems(bound);
    } else {
      data[placeholder.key] = valueForTextPlaceholder(bound);
    }
  }
  return data;
}

function templateDataForDesignImage(
  pausedState: NodeOutputs | undefined,
  dynamicValue: PlaceholderValue,
): PlaceholderData {
  const placeholders = Array.isArray(pausedState?.previewPlaceholders)
    ? pausedState.previewPlaceholders.filter(isPlaceholderRecord)
    : [];
  const bindings =
    pausedState?.previewBindings &&
    typeof pausedState.previewBindings === "object" &&
    !Array.isArray(pausedState.previewBindings)
      ? (pausedState.previewBindings as Record<string, unknown>)
      : {};
  const dynamicKey =
    typeof pausedState?.dynamicImagePlaceholderKey === "string"
      ? pausedState.dynamicImagePlaceholderKey
      : "";
  const data: PlaceholderData = {};

  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    const value =
      bound !== undefined && bound !== "" ? valueToOutputText(bound) : "";
    data[placeholder.key] =
      placeholder.key === dynamicKey ? dynamicValue : value;
  }

  return data;
}

function outputForCuratedImages(
  pausedState: NodeOutputs | undefined,
  selectedImages: SelectedImageChoice[],
): NodeOutputs {
  const ranked = normalizeImageCandidates(
    Array.isArray(pausedState?.ranked)
      ? pausedState.ranked
      : pausedState?.candidates,
  );
  const byUrl = new Map(ranked.map((candidate) => [candidate.url, candidate]));
  const seen = new Set<string>();
  const selectedChoices = selectedImages.filter((choice) => {
    if (!choice.url || seen.has(choice.url)) return false;
    seen.add(choice.url);
    return true;
  });
  const selected = selectedChoices.flatMap((choice) => {
    const candidate = byUrl.get(choice.url);
    if (!candidate) return [];
    const scale = normalizeImageScale(choice.scale);
    return [
      {
        ...candidate,
        ...(choice.objectPosition
          ? { objectPosition: choice.objectPosition }
          : {}),
        ...(scale !== undefined ? { scale } : {}),
      },
    ];
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
      selectedChoices,
    ),
    best: selected[0]?.url ?? "",
  };
}

function outputForHumanChoice(
  pausedState: NodeOutputs | undefined,
  choice: ResumeChoice,
): NodeOutputs {
  if ("selectedImages" in choice) {
    return outputForCuratedImages(pausedState, choice.selectedImages);
  }

  if ("selectedUrls" in choice) {
    return outputForCuratedImages(
      pausedState,
      choice.selectedUrls.map((url) => ({ url })),
    );
  }

  const choiceUrl = choice.choiceUrl;
  if (pausedState?.reviewKind === "design-image") {
    const candidates = pausedState?.candidates;
    const chosenImage = Array.isArray(candidates)
      ? candidates.find(
          (candidate) =>
            candidate &&
            typeof candidate === "object" &&
            "url" in candidate &&
            candidate.url === choiceUrl,
        )
      : undefined;
    // Collapse to a bare URL when the frame is untouched, else a
    // PlaceholderImageValue carrying the crop — the single source of truth the
    // picker preview mirrors via `placementToPlaceholderValue`.
    const placementValue = imageChoiceToPlaceholderValue({
      url: choiceUrl,
      objectPosition: choice.objectPosition,
      scale: choice.scale,
    });

    return {
      chosen: choiceUrl,
      chosenImage: isPlaceholderImageValue(placementValue)
        ? { ...(chosenImage ?? {}), ...placementValue }
        : (chosenImage ?? { url: choiceUrl }),
      templateData: templateDataForDesignImage(pausedState, placementValue),
    };
  }

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

  const resumed = await step("resume:apply-choice", () =>
    transitionRunState(runId, ["waiting"], {
      status: "running",
      nodeOutputs,
      nodeStates,
      waitingNodeId: null,
      resumeToken: null,
    }),
  );
  if (!resumed) throw new Error("Run is not awaiting input");

  await execute(runId, workflow.graph as WorkflowGraph, step);
}
