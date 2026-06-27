import { z } from "zod";
import { getNodeType } from "@/lib/nodes/registry";
import { hasCycle } from "./graph";
import type { WorkflowGraph } from "./types";

/**
 * Validates the workflow write payload. The graph is produced by our own canvas,
 * so we check the envelope, reject unknown node types, and reject cycles (the
 * engine assumes a DAG).
 */
const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.unknown()).default({}),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional().nullable(),
  targetHandle: z.string().optional().nullable(),
});

const graphSchema = z
  .object({
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
  })
  .superRefine((graph, ctx) => {
    for (const n of graph.nodes) {
      if (!getNodeType(n.type)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown node type: ${n.type}`,
          path: ["nodes"],
        });
      }
    }
    if (hasCycle(graph as WorkflowGraph)) {
      ctx.addIssue({ code: "custom", message: "Workflow graph has a cycle", path: ["edges"] });
    }
  });

export const workflowInputSchema = z.object({
  name: z.string().min(1).max(200),
  active: z.boolean().default(false),
  graph: graphSchema,
});

export type WorkflowInputBody = z.infer<typeof workflowInputSchema>;
