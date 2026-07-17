import { ROUTER_TYPE_ID } from "./conditions";
import {
  routerBranchColumns,
  type BranchColumn,
} from "@/plugins/core/nodes/router/meta";
import type { WfNode } from "./store";

/**
 * Editor-side control-flow layout shared by the store (position assignment) and
 * the canvas (connector routing), so the two never disagree on where steps sit.
 *
 * The trunk is a single centred column. A Router fans its branch columns out
 * symmetrically beneath it (parallel columns), and the trunk resumes below the
 * tallest branch — the rejoin. Branch lanes are simple vertical lists; nested
 * routers inside a branch aren't laid out yet (the engine supports them, the
 * editor doesn't create them).
 */

/** Vertical spacing between step rows, in px. */
export const ROW_GAP_Y = 110;
/** Horizontal spacing between branch columns, in px. */
export const COL_GAP_X = 260;

/** A router's branch column paired with the steps currently in that lane. */
export type RouterLane = { column: BranchColumn; nodes: WfNode[] };
/** One trunk step; `lanes` is non-empty only for a Router. */
export type TrunkEntry = { node: WfNode; lanes: RouterLane[] };

/** Lane identity for a node: its router+branch, or the trunk. */
export function laneKey(n: WfNode): string {
  const b = n.data.branch;
  return b ? `${b.routerId}:${b.branchId}` : "trunk";
}

/** Steps in the same lane as `node`, in stored (array) order. */
export function laneNodes(nodes: WfNode[], node: WfNode): WfNode[] {
  const key = laneKey(node);
  return nodes.filter((n) => laneKey(n) === key);
}

/**
 * Decompose the flat node list into the trunk and, for each Router, its branch
 * lanes (in column order: explicit branches, then Else). Preserves stored order
 * within every lane.
 */
export function buildStructure(nodes: WfNode[]): TrunkEntry[] {
  const trunk = nodes.filter((n) => !n.data.branch);
  return trunk.map((node) => {
    if (node.type !== ROUTER_TYPE_ID) return { node, lanes: [] };
    const lanes = routerBranchColumns(node.data.config).map((column) => ({
      column,
      nodes: nodes.filter(
        (n) =>
          n.data.branch?.routerId === node.id &&
          n.data.branch.branchId === column.branchId,
      ),
    }));
    return { node, lanes };
  });
}

/**
 * Assign every node a derived position (parallel-column layout) plus transient
 * view fields (`step`, `laneFirst`, `laneLast`) the node card reads. Never
 * reorders the flat array — only updates positions/data — so lane sequencing
 * stays governed by array order.
 */
export function layoutNodes(nodes: WfNode[]): WfNode[] {
  const pos = new Map<string, { x: number; y: number }>();
  const view = new Map<
    string,
    { step: number; stepLabel: string; laneFirst: boolean; laneLast: boolean }
  >();

  const structure = buildStructure(nodes);
  let row = 0;
  structure.forEach(({ node, lanes }, trunkIdx) => {
    pos.set(node.id, { x: 0, y: row * ROW_GAP_Y });
    view.set(node.id, {
      step: trunkIdx,
      stepLabel: String(trunkIdx),
      laneFirst: trunkIdx === 0,
      laneLast: trunkIdx === structure.length - 1,
    });
    row += 1;

    if (lanes.length > 0) {
      const k = lanes.length;
      let maxLen = 0;
      lanes.forEach((lane, c) => {
        const x = (c - (k - 1) / 2) * COL_GAP_X;
        lane.nodes.forEach((ln, li) => {
          pos.set(ln.id, { x, y: (row + li) * ROW_GAP_Y });
          view.set(ln.id, {
            step: li + 1,
            stepLabel: `${trunkIdx}.${li + 1}`,
            laneFirst: li === 0,
            laneLast: li === lane.nodes.length - 1,
          });
        });
        maxLen = Math.max(maxLen, lane.nodes.length);
      });
      row += maxLen;
    }
  });

  return nodes.map((n) => {
    const v = view.get(n.id);
    return {
      ...n,
      position: pos.get(n.id) ?? n.position,
      data: {
        ...n.data,
        step: v?.step,
        stepLabel: v?.stepLabel,
        laneFirst: v?.laneFirst,
        laneLast: v?.laneLast,
      },
    };
  });
}
