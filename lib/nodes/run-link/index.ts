import { publicAppUrl } from "@/lib/env";
import { getRun } from "@/lib/workflows/runs-service";
import type { NodeDefinition } from "../types";
import { runLinkMeta, type RunLinkConfig } from "./meta";

export const runLinkNode: NodeDefinition<RunLinkConfig> = {
  ...runLinkMeta,

  async run(ctx) {
    const run = await getRun(ctx.runId);
    if (!run) throw new Error("Run not found");

    const path = `/workflows/${run.workflowId}/runs/${run.id}`;
    const baseUrl = publicAppUrl();
    const url = baseUrl ? `${baseUrl}${path}` : path;

    return {
      type: "output",
      outputs: {
        url,
        path,
        runId: run.id,
        workflowId: run.workflowId,
      },
    };
  },
};
