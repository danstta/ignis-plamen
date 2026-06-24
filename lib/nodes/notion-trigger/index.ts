import type { NodeDefinition } from "../types";
import { notionTriggerMeta, type NotionTriggerConfig } from "./meta";

/**
 * Reads the already-normalized Notion webhook payload off the run trigger
 * (verification + page fetch + normalizePage happen upstream in the webhook
 * route) and exposes the chosen Location property plus the full field map.
 */
export const notionTriggerNode: NodeDefinition<NotionTriggerConfig> = {
  ...notionTriggerMeta,

  async run(ctx) {
    const fields = (ctx.trigger.fields ?? {}) as Record<string, string>;
    const location = fields[ctx.config.locationProperty] ?? "";
    return { type: "output", outputs: { location, fields } };
  },
};
