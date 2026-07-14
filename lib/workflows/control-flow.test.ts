import { describe, expect, test } from "bun:test";
import { branchSteps, orderLane, trunkSteps } from "./control-flow";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./types";

/**
 * Characterization tests for router lane helpers: which steps belong to the
 * trunk vs. a branch lane, and how a single lane orders its own steps.
 */

let edgeSeq = 0;

function node(
  id: string,
  opts: {
    config?: Record<string, unknown>;
    branch?: { routerId: string; branchId: string };
  } = {},
): WorkflowNode {
  return {
    id,
    type: "test-node",
    position: { x: 0, y: 0 },
    config: opts.config ?? {},
    ...(opts.branch ? { branch: opts.branch } : {}),
  };
}

function edge(source: string, target: string): WorkflowEdge {
  return { id: `e${edgeSeq++}`, source, target };
}

const g: WorkflowGraph = {
  nodes: [
    node("t1"),
    node("router"),
    node("b1a", { branch: { routerId: "router", branchId: "yes" } }),
    node("b1b", { branch: { routerId: "router", branchId: "yes" } }),
    node("b2a", { branch: { routerId: "router", branchId: "else" } }),
    node("t2"),
  ],
  edges: [],
};

describe("trunkSteps", () => {
  test("excludes branch-owned nodes, keeps stored order", () => {
    expect(trunkSteps(g).map((n) => n.id)).toEqual(["t1", "router", "t2"]);
  });
});

describe("branchSteps", () => {
  test("filters by routerId and branchId", () => {
    expect(branchSteps(g, "router", "yes").map((n) => n.id)).toEqual([
      "b1a",
      "b1b",
    ]);
    expect(branchSteps(g, "router", "else").map((n) => n.id)).toEqual(["b2a"]);
  });

  test("unknown router or branch yields no steps", () => {
    expect(branchSteps(g, "other-router", "yes")).toEqual([]);
    expect(branchSteps(g, "router", "no-such-branch")).toEqual([]);
  });
});

describe("orderLane", () => {
  test("respects intra-lane wired dependencies", () => {
    const lane = [node("late"), node("early")];
    expect(
      orderLane(lane, [edge("early", "late")]).map((n) => n.id),
    ).toEqual(["early", "late"]);
  });

  test("respects intra-lane token dependencies", () => {
    const lane = [
      node("consumer", { config: { text: "{{producer.out}}" } }),
      node("producer"),
    ];
    expect(orderLane(lane, []).map((n) => n.id)).toEqual([
      "producer",
      "consumer",
    ]);
  });

  test("ignores edges that leave the lane", () => {
    const lane = [node("a"), node("b")];
    // Edge from an outside node must not affect (or break) lane ordering.
    expect(
      orderLane(lane, [edge("outside", "a"), edge("b", "outside")]).map(
        (n) => n.id,
      ),
    ).toEqual(["a", "b"]);
  });

  test("falls back to stored order when the lane has no internal edges", () => {
    const lane = [node("z"), node("m"), node("a")];
    expect(orderLane(lane, []).map((n) => n.id)).toEqual(["z", "m", "a"]);
  });

  test("falls back to stored order when intra-lane edges form a cycle", () => {
    const lane = [node("a"), node("b")];
    expect(
      orderLane(lane, [edge("a", "b"), edge("b", "a")]).map((n) => n.id),
    ).toEqual(["a", "b"]);
  });
});
