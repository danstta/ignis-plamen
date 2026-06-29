import { z } from "zod";
import {
  CONDITION_OPS,
  ELSE_BRANCH_ID,
  ROUTER_TYPE_ID,
} from "@/lib/workflows/conditions";
import type { NodeMeta } from "../types";

/**
 * One conditional branch. `left`/`right` are operand expressions that may contain
 * `{{nodeId.path}}` tokens — the engine resolves them against upstream outputs
 * before the router runs (hence `coerce` to a string, since an exact-token match
 * can resolve to a number/array). Branches are evaluated in array order; the
 * first whose condition holds wins, else the implicit "else" branch is taken.
 */
export const routerBranchSchema = z.object({
  id: z.string(),
  label: z.string().default(""),
  left: z.coerce.string().default(""),
  op: z.enum(CONDITION_OPS).default("eq"),
  right: z.coerce.string().default(""),
});
export type RouterBranch = z.infer<typeof routerBranchSchema>;

export const routerConfigSchema = z.object({
  branches: z.array(routerBranchSchema).default([]),
});
export type RouterConfig = z.infer<typeof routerConfigSchema>;

export const routerMeta: NodeMeta<RouterConfig> = {
  id: ROUTER_TYPE_ID,
  label: "Router",
  description:
    "Routes the workflow down one of several branches based on conditions over upstream data. The first matching branch wins; otherwise the Else branch runs.",
  category: "control",
  inputs: [],
  // `branch` is the chosen branch id — the engine reads it to pick which lane to run.
  outputs: [{ id: "branch", label: "Chosen branch", kind: "data" }],
  // The branch/condition editor is rendered specially by the config panel.
  configFields: [],
  configSchema: routerConfigSchema,
};

/** A column the editor renders for a router: its explicit branches, then Else. */
export interface BranchColumn {
  branchId: string;
  label: string;
  isElse: boolean;
}

/**
 * The ordered branch columns for a router config: each explicit branch in order,
 * then the always-present implicit Else. Shared by the layout, canvas connectors,
 * and the branch editor so they never disagree on a router's columns. Reads the
 * raw stored config defensively (it may predate the current schema).
 */
export function routerBranchColumns(config: unknown): BranchColumn[] {
  const branches =
    (config as { branches?: { id: string; label?: string }[] } | null)
      ?.branches ?? [];
  const cols = branches.map((b) => ({
    branchId: b.id,
    label: b.label?.trim() || "Branch",
    isElse: false,
  }));
  return [...cols, { branchId: ELSE_BRANCH_ID, label: "Else", isElse: true }];
}
