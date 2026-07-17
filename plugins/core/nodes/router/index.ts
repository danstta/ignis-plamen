import { ELSE_BRANCH_ID, evaluateCondition } from "@/lib/workflows/conditions";
import type { NodeDefinition } from "@/lib/nodes/types";
import { routerMeta, type RouterConfig } from "./meta";

/**
 * Conditional router. Each branch's `left`/`right` operands arrive already
 * token-resolved (the engine substitutes `{{nodeId.path}}` against upstream
 * outputs before run), so this just evaluates the resolved comparisons in order
 * and emits the first matching branch id — or "else" when none match. The engine
 * reads `outputs.branch` to decide which branch lane to execute next.
 */
export const routerNode: NodeDefinition<RouterConfig> = {
  ...routerMeta,

  async run(ctx) {
    for (const b of ctx.config.branches) {
      if (evaluateCondition({ left: b.left, op: b.op, right: b.right })) {
        ctx.log(`matched branch "${b.label || b.id}"`);
        return {
          type: "output",
          outputs: {
            branch: b.id,
            routeMode: b.routeMode,
            maxAttempts: b.maxAttempts,
          },
        };
      }
    }
    ctx.log("no branch matched — routing to Else");
    return { type: "output", outputs: { branch: ELSE_BRANCH_ID } };
  },
};
