import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { StepRunner } from "./engine";
import type { NodeDefinition, NodeRunContext, RunResult } from "@/lib/nodes/types";
import type { NodeOutputs, RunStatus, WorkflowGraph } from "./types";
import type { RunStatePatch } from "./runs-service";

/**
 * Engine behavior tests for plan 002's durable-execution guarantees: guarded
 * status transitions, replay-idempotent log keys, and pause/stop unwinding.
 * The DB layer (`runs-service`), node registry, plugin service, and workflow
 * service are module-mocked so the engine runs fully in memory.
 */

type Row = {
  id: string;
  workflowId: string;
  status: RunStatus;
  trigger: Record<string, unknown>;
  nodeOutputs: Record<string, NodeOutputs>;
  nodeStates: Record<string, string>;
  nodeLogs: Record<string, unknown[]> | null;
  waitingNodeId: string | null;
  resumeToken: string | null;
  error: string | null;
};

const freshRow = (): Row => ({
  id: "run-1",
  workflowId: "wf-1",
  status: "running",
  trigger: {},
  nodeOutputs: {},
  nodeStates: {},
  nodeLogs: null,
  waitingNodeId: null,
  resumeToken: null,
  error: null,
});

let runRow: Row;
let appendCalls: {
  runId: string;
  nodeId: string;
  visit: number;
  seq: number;
  level: string;
  message: string;
}[] = [];
let transitionCalls: { id: string; from: RunStatus[]; patch: RunStatePatch }[] =
  [];
let saveCalls: { id: string; patch: RunStatePatch }[] = [];
let transitionImpl: (
  id: string,
  from: RunStatus[],
  patch: RunStatePatch,
) => Row | null;
let getRunCalls = 0;
let getRunStatusCalls = 0;

mock.module("./runs-service", () => ({
  appendRunLog: async (entry: (typeof appendCalls)[number]) => {
    appendCalls.push(entry);
  },
  createRun: async () => runRow,
  getRun: async () => {
    getRunCalls += 1;
    return runRow;
  },
  getRunStatus: async () => {
    getRunStatusCalls += 1;
    return runRow.status;
  },
  saveRunState: async (id: string, patch: RunStatePatch) => {
    saveCalls.push({ id, patch });
    return runRow;
  },
  transitionRunState: async (
    id: string,
    from: RunStatus[],
    patch: RunStatePatch,
  ) => {
    transitionCalls.push({ id, from, patch });
    return transitionImpl(id, from, patch);
  },
}));

const graphs: Record<string, WorkflowGraph> = {};

mock.module("./service", () => ({
  getWorkflow: async (id: string) => ({
    id,
    name: "Test workflow",
    graph: graphs[id] ?? { nodes: [], edges: [] },
  }),
}));

/** Node types whose (mock) owning plugin is enabled. */
let enabledTypes: Set<string>;
let enabledSetLoads = 0;

mock.module("@/lib/plugins/service", () => ({
  enabledNodeTypeIds: async () => {
    enabledSetLoads += 1;
    return enabledTypes;
  },
}));

/** Node ids in the order their run() bodies actually executed. */
let nodeRuns: string[] = [];
/** Outputs the router returns on successive run() calls. */
let routerOutputQueue: NodeOutputs[] = [];

const passthroughSchema = {
  parse: (value: unknown) => (value ?? {}) as Record<string, unknown>,
} as unknown as NodeDefinition["configSchema"];

const defBase = {
  description: "",
  group: "utility" as const,
  inputs: [],
  outputs: [],
  configFields: [],
  configSchema: passthroughSchema,
};

const nodeDefs: Record<string, NodeDefinition> = {
  "t-log": {
    ...defBase,
    id: "t-log",
    label: "Log Lines",
    category: "transform",
    run: async (ctx: NodeRunContext): Promise<RunResult> => {
      nodeRuns.push(ctx.nodeId);
      await ctx.log("one");
      await ctx.log("two");
      return { type: "output", outputs: { ok: true } };
    },
  },
  "t-pause": {
    ...defBase,
    id: "t-pause",
    label: "Pause",
    category: "transform",
    run: async (ctx: NodeRunContext): Promise<RunResult> => {
      nodeRuns.push(ctx.nodeId);
      return { type: "pause", state: { candidates: [] } };
    },
  },
  router: {
    ...defBase,
    id: "router",
    label: "Router",
    category: "control",
    run: async (ctx: NodeRunContext): Promise<RunResult> => {
      nodeRuns.push(ctx.nodeId);
      return {
        type: "output",
        outputs: routerOutputQueue.shift() ?? {
          branch: "else",
          routeMode: "branch",
        },
      };
    },
  },
};

mock.module("@/lib/nodes/registry", () => ({
  getNodeType: (type: string) => nodeDefs[type],
}));

const { startRun } = await import("./engine");

const node = (id: string, type: string) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
});

/** Fresh Inngest-like memoizing runner: each step id runs once per map. */
const memoRunner = (memo: Map<string, unknown>): StepRunner => {
  return async <T>(stepId: string, fn: () => Promise<T>): Promise<T> => {
    if (memo.has(stepId)) return memo.get(stepId) as T;
    const result = await fn();
    memo.set(stepId, result);
    return result;
  };
};

beforeEach(() => {
  runRow = freshRow();
  appendCalls = [];
  transitionCalls = [];
  saveCalls = [];
  nodeRuns = [];
  routerOutputQueue = [];
  getRunCalls = 0;
  getRunStatusCalls = 0;
  enabledTypes = new Set(Object.keys(nodeDefs));
  enabledSetLoads = 0;
  transitionImpl = (_id, from, patch) =>
    from.includes(runRow.status) ? { ...runRow, ...patch } : null;
});

describe("guarded status transitions", () => {
  test("final success is a guarded transition from running, not an unconditional save", async () => {
    graphs["wf-1"] = {
      nodes: [node("a", "t-log"), node("b", "t-log")],
      edges: [{ id: "e1", source: "a", target: "b" }],
    };

    await startRun("wf-1", {});

    const success = transitionCalls.filter((c) => c.patch.status === "success");
    expect(success).toEqual([
      { id: "run-1", from: ["running"], patch: { status: "success" } },
    ]);
    // No status write bypasses the guard.
    expect(saveCalls.every((c) => c.patch.status === undefined)).toBe(true);
    expect(nodeRuns).toEqual(["a", "b"]);
  });

  test("pause persists as a guarded waiting transition and stops the walk", async () => {
    graphs["wf-1"] = {
      nodes: [node("a", "t-pause"), node("b", "t-log")],
      edges: [{ id: "e1", source: "a", target: "b" }],
    };

    await startRun("wf-1", {});

    const waiting = transitionCalls.filter((c) => c.patch.status === "waiting");
    expect(waiting).toHaveLength(1);
    expect(waiting[0].from).toEqual(["running"]);
    expect(waiting[0].patch.waitingNodeId).toBe("a");
    // Downstream node never ran; no success transition was attempted.
    expect(nodeRuns).toEqual(["a"]);
    expect(
      transitionCalls.some((c) => c.patch.status === "success"),
    ).toBe(false);
  });

  test("a lost waiting transition (concurrent stop) still unwinds without running more nodes", async () => {
    graphs["wf-1"] = {
      nodes: [node("a", "t-pause"), node("b", "t-log")],
      edges: [{ id: "e1", source: "a", target: "b" }],
    };
    // Simulate stopRun winning the race: the guarded update matches zero rows.
    transitionImpl = (_id, _from, patch) =>
      patch.status === "waiting" ? null : { ...runRow, ...patch };

    await startRun("wf-1", {});

    expect(nodeRuns).toEqual(["a"]);
    expect(
      transitionCalls.some((c) => c.patch.status === "success"),
    ).toBe(false);
  });
});

describe("hot-path reads", () => {
  test("a stopped run aborts via the status-only probe before any node work", async () => {
    graphs["wf-1"] = {
      nodes: [node("a", "t-log")],
      edges: [],
    };
    runRow.status = "stopped";

    await startRun("wf-1", {});

    expect(nodeRuns).toEqual([]);
    expect(getRunStatusCalls).toBeGreaterThan(0);
    // Full-row reads stay confined to the memoized execute:load-run step.
    expect(getRunCalls).toBe(1);
    expect(transitionCalls).toEqual([]);
  });

  test("a disabled node type errors without per-node plugin queries", async () => {
    graphs["wf-1"] = {
      nodes: [node("a", "t-log"), node("b", "t-log")],
      edges: [{ id: "e1", source: "a", target: "b" }],
    };
    enabledTypes = new Set();

    await startRun("wf-1", {});

    expect(nodeRuns).toEqual([]);
    const error = transitionCalls.filter((c) => c.patch.status === "error");
    expect(error).toHaveLength(1);
    expect(error[0].patch.error).toContain("belongs to a disabled plugin");
    // The enabled set is loaded exactly once per execution.
    expect(enabledSetLoads).toBe(1);
  });
});

describe("log keys", () => {
  test("seq increases per node and restarts when the visit count increments", async () => {
    graphs["wf-1"] = {
      nodes: [node("a", "t-log"), node("r", "router")],
      edges: [{ id: "e1", source: "a", target: "r" }],
    };
    // First router pass demands a redo of the previous node; second routes on.
    routerOutputQueue = [
      { branch: "b1", routeMode: "redoPrevious", maxAttempts: 3 },
      { branch: "else", routeMode: "branch" },
    ];

    await startRun("wf-1", {});

    expect(nodeRuns).toEqual(["a", "r", "a", "r"]);
    const forNode = (nodeId: string, visit: number) =>
      appendCalls.filter((c) => c.nodeId === nodeId && c.visit === visit);
    const visit1 = forNode("a", 1);
    const visit2 = forNode("a", 2);
    expect(visit1.length).toBeGreaterThan(0);
    // Identical work on the redo emits the same number of lines.
    expect(visit2.length).toBe(visit1.length);
    // Strictly increasing 1..n within each visit; numbering restarts per visit.
    expect(visit1.map((c) => c.seq)).toEqual(visit1.map((_, i) => i + 1));
    expect(visit2.map((c) => c.seq)).toEqual(visit2.map((_, i) => i + 1));
    // The node's own log lines land in both visits.
    expect(visit1.map((c) => c.message)).toContain("one");
    expect(visit2.map((c) => c.message)).toContain("one");
  });

  test("replaying the same run emits identical log keys, so ON CONFLICT dedupes", async () => {
    graphs["wf-1"] = {
      nodes: [node("a", "t-log"), node("b", "t-log")],
      edges: [{ id: "e1", source: "a", target: "b" }],
    };

    await startRun("wf-1", {}, undefined, memoRunner(new Map()));
    const firstPass = appendCalls.map(
      (c) => `${c.runId}/${c.nodeId}/${c.visit}/${c.seq}/${c.message}`,
    );

    // A redelivered execution starts with fresh memoization but identical
    // deterministic loop control — every insert re-derives the same key.
    appendCalls = [];
    runRow = freshRow();
    await startRun("wf-1", {}, undefined, memoRunner(new Map()));
    const secondPass = appendCalls.map(
      (c) => `${c.runId}/${c.nodeId}/${c.visit}/${c.seq}/${c.message}`,
    );

    expect(firstPass.length).toBeGreaterThan(0);
    expect(secondPass).toEqual(firstPass);
  });

  test("memoized steps do not re-emit logs on partial replay", async () => {
    graphs["wf-1"] = {
      nodes: [node("a", "t-log"), node("b", "t-log")],
      edges: [{ id: "e1", source: "a", target: "b" }],
    };
    const memo = new Map<string, unknown>();

    await startRun("wf-1", {}, undefined, memoRunner(memo));
    const firstCount = appendCalls.length;
    expect(firstCount).toBeGreaterThan(0);

    // Replay with the memo intact (a crash after the last persisted step):
    // every node step is memoized, so no log write re-executes.
    appendCalls = [];
    await startRun("wf-1", {}, undefined, memoRunner(memo));
    expect(appendCalls).toHaveLength(0);
  });
});
