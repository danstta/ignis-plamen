import { describe, expect, test } from "bun:test";
import { hasCycle, incomingEdges, outgoingEdges, topoOrder } from "./graph";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./types";

/**
 * Characterization tests for execution ordering. The load-bearing behavior:
 * a `{{nodeId.path}}` token in a config is a dependency edge even when nothing
 * is wired, so token-only consumers still run after their producers.
 */

let edgeSeq = 0;

function node(id: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type: "test-node", position: { x: 0, y: 0 }, config };
}

function edge(source: string, target: string): WorkflowEdge {
  return { id: `e${edgeSeq++}`, source, target };
}

function graph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { nodes, edges };
}

describe("topoOrder", () => {
  test("orders by wired edges", () => {
    const g = graph([node("b"), node("a")], [edge("a", "b")]);
    expect(topoOrder(g)?.map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("orders by token-implied edges with no wire", () => {
    const g = graph(
      [node("consumer", { text: "{{producer.body.x}}" }), node("producer")],
      [],
    );
    expect(topoOrder(g)?.map((n) => n.id)).toEqual(["producer", "consumer"]);
  });

  test("token dependency nested deep in config still counts", () => {
    const g = graph(
      [
        node("c", { layers: [{ slots: { title: "{{p.name}}" } }] }),
        node("p"),
      ],
      [],
    );
    expect(topoOrder(g)?.map((n) => n.id)).toEqual(["p", "c"]);
  });

  test("returns null on a wired cycle", () => {
    const g = graph([node("a"), node("b")], [edge("a", "b"), edge("b", "a")]);
    expect(topoOrder(g)).toBeNull();
  });

  test("returns null on a cycle formed by a wire plus a token reference", () => {
    const g = graph(
      [node("a", { text: "{{b.out}}" }), node("b")],
      [edge("a", "b")],
    );
    expect(topoOrder(g)).toBeNull();
  });

  test("edges referencing unknown node ids are ignored", () => {
    const g = graph(
      [node("a")],
      [edge("ghost", "a"), edge("a", "phantom")],
    );
    expect(topoOrder(g)?.map((n) => n.id)).toEqual(["a"]);
  });

  test("token references to unknown ids and self do not add edges", () => {
    const g = graph(
      [node("a", { text: "{{ghost.x}} and {{a.self}} and {{trigger.body}}" })],
      [],
    );
    expect(topoOrder(g)?.map((n) => n.id)).toEqual(["a"]);
  });

  test("independent nodes keep stored order", () => {
    const g = graph([node("x"), node("y"), node("z")], []);
    expect(topoOrder(g)?.map((n) => n.id)).toEqual(["x", "y", "z"]);
  });

  test("empty graph orders to an empty list", () => {
    expect(topoOrder(graph([], []))).toEqual([]);
  });
});

describe("hasCycle", () => {
  test("mirrors topoOrder", () => {
    expect(
      hasCycle(graph([node("a"), node("b")], [edge("a", "b"), edge("b", "a")])),
    ).toBe(true);
    expect(hasCycle(graph([node("a"), node("b")], [edge("a", "b")]))).toBe(
      false,
    );
  });
});

describe("incomingEdges / outgoingEdges", () => {
  test("filter by target and source respectively", () => {
    const e1 = edge("a", "b");
    const e2 = edge("b", "c");
    const g = graph([node("a"), node("b"), node("c")], [e1, e2]);
    expect(incomingEdges(g, "b")).toEqual([e1]);
    expect(outgoingEdges(g, "b")).toEqual([e2]);
    expect(incomingEdges(g, "a")).toEqual([]);
  });
});
