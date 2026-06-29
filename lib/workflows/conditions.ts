/**
 * Leaf module (no project imports) for router condition primitives. Kept separate
 * from control-flow.ts so node metadata can import these constants without pulling
 * in the lane helpers' dependency chain (graph -> references -> node catalog),
 * which would otherwise cycle back through the router's own metadata.
 */

/** The router node's stable type id. */
export const ROUTER_TYPE_ID = "router";
/** Reserved branch id taken when no condition matches. */
export const ELSE_BRANCH_ID = "else";

export const CONDITION_OPS = [
  "eq",
  "ne",
  "contains",
  "gt",
  "lt",
  "exists",
  "empty",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

/** Human labels for each operator (used by the condition editor). */
export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  eq: "equals",
  ne: "does not equal",
  contains: "contains",
  gt: "greater than",
  lt: "less than",
  exists: "is not empty",
  empty: "is empty",
};

/** Operators that don't use the right-hand operand. */
export function isUnaryOp(op: ConditionOp): boolean {
  return op === "exists" || op === "empty";
}

/** One branch's gate. `left`/`right` are *already token-resolved* by the engine. */
export interface BranchCondition {
  left: string;
  op: ConditionOp;
  right: string;
}

/**
 * Evaluate a resolved condition. Numeric ops parse both sides as floats (and are
 * false unless both parse); the rest are string comparisons. `exists`/`empty`
 * treat a whitespace-only value as empty (an unresolved token resolves to "").
 */
export function evaluateCondition(c: BranchCondition): boolean {
  const left = c.left ?? "";
  const right = c.right ?? "";
  switch (c.op) {
    case "exists":
      return left.trim() !== "";
    case "empty":
      return left.trim() === "";
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "contains":
      return left.includes(right);
    case "gt": {
      const a = Number.parseFloat(left);
      const b = Number.parseFloat(right);
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case "lt": {
      const a = Number.parseFloat(left);
      const b = Number.parseFloat(right);
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    default:
      return false;
  }
}
