import { z } from "zod";
import type { NodeMeta } from "../types";

/**
 * A captured sample field: a dot-path into the received payload plus a preview of
 * the value, so downstream nodes can reference it (see lib/workflows/references).
 */
export const sampleFieldSchema = z.object({
  path: z.string(),
  preview: z.string().default(""),
});
export type SampleField = z.infer<typeof sampleFieldSchema>;

export const webhookConfigSchema = z.object({
  /** Raw captured payload ({ body, headers, query }) from "Capture sample event". */
  sample: z.record(z.string(), z.unknown()).optional(),
  /** Structural field paths (array indices as `*`) discovered in the sample, offered for selection. */
  sampleFields: z.array(sampleFieldSchema).default([]),
  /**
   * Structural dot-paths (e.g. `body.items.*.title`) the user locked in to expose
   * downstream — the webhook's expected contract. Empty = expose nothing. A run
   * fails up-front if an inbound payload is missing any of these (see startRun).
   */
  selectedFields: z.array(z.string()).default([]),
});

export type WebhookConfig = z.infer<typeof webhookConfigSchema>;

export const webhookMeta: NodeMeta<WebhookConfig> = {
  id: "webhook",
  label: "Webhook",
  description:
    "Starts the workflow when data is POSTed to its URL, exposing the request body, headers, and query to downstream nodes.",
  category: "trigger",
  inputs: [],
  outputs: [
    { id: "body", label: "Body", kind: "data" },
    { id: "headers", label: "Headers", kind: "data" },
    { id: "query", label: "Query", kind: "data" },
  ],
  // The URL + "Capture sample event" UI is rendered specially by the config panel
  // (it needs the saved workflow id), so no generic config fields here.
  configFields: [],
  configSchema: webhookConfigSchema,
};
