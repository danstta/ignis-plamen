import type { NodeDefinition } from "@/lib/nodes/types";
import { webhookMeta, type WebhookConfig } from "./meta";

/**
 * Generic webhook trigger. The hooks route normally pre-seeds this node's outputs
 * with the inbound request before the engine runs, so `run` is just a passthrough
 * that mirrors the trigger payload onto the body/headers/query ports.
 */
export const webhookNode: NodeDefinition<WebhookConfig> = {
  ...webhookMeta,

  async run(ctx) {
    const t = ctx.trigger as {
      body?: unknown;
      headers?: unknown;
      query?: unknown;
    };
    const bodyKeys =
      t.body !== null && typeof t.body === "object"
        ? Object.keys(t.body as Record<string, unknown>)
        : [];
    ctx.log(
      `received webhook — body keys: [${bodyKeys.join(", ")}], ${
        Object.keys((t.query as Record<string, unknown>) ?? {}).length
      } query param(s)`,
    );
    return {
      type: "output",
      outputs: {
        body: t.body ?? {},
        headers: t.headers ?? {},
        query: t.query ?? {},
      },
    };
  },
};
