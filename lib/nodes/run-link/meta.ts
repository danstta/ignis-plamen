import { z } from "zod";
import type { NodeMeta } from "../types";

export const RUN_LINK_TYPE_ID = "run-link";

export const runLinkConfigSchema = z.object({});

export type RunLinkConfig = z.infer<typeof runLinkConfigSchema>;

export const runLinkMeta: NodeMeta<RunLinkConfig> = {
  id: RUN_LINK_TYPE_ID,
  label: "Run Link",
  description:
    "Outputs a link to the current workflow run so you can inspect progress and review paused steps.",
  category: "transform",
  inputs: [],
  outputs: [
    { id: "url", label: "Run URL", kind: "text" },
    { id: "path", label: "Run path", kind: "text" },
    { id: "runId", label: "Run ID", kind: "text" },
    { id: "workflowId", label: "Workflow ID", kind: "text" },
  ],
  configFields: [],
  configSchema: runLinkConfigSchema,
};
