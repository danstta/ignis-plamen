import {
  readNotionWebhookSignal,
  signalMatchesConfiguredDataSource,
} from "@/lib/link-hub/notion";
import {
  syncLinkHubDataSource,
  syncLinkHubPage,
  syncLinkHubPayload,
  type LinkHubSyncResult,
} from "@/lib/link-hub/sync";
import type { NodeDefinition } from "../types";
import {
  linkHubSupabaseSyncMeta,
  type LinkHubSupabaseSyncConfig,
} from "./meta";

async function fallbackSync(payload: unknown): Promise<LinkHubSyncResult> {
  const signal = readNotionWebhookSignal(payload);
  if (!signalMatchesConfiguredDataSource(signal)) {
    return {
      mode: "full",
      upserted: 0,
      hidden: 0,
      skipped: "event_outside_configured_data_source",
    };
  }

  if (!signal.requiresFullSync && signal.pageId) {
    return syncLinkHubPage(signal.pageId);
  }

  return syncLinkHubDataSource();
}

export const linkHubSupabaseSyncNode: NodeDefinition<LinkHubSupabaseSyncConfig> = {
  ...linkHubSupabaseSyncMeta,

  async run(ctx) {
    const payload = ctx.inputs.payload ?? ctx.trigger.body ?? ctx.trigger;

    await ctx.throwIfStopped?.();
    let result = await syncLinkHubPayload(payload);
    if (
      result.skipped === "payload_missing_link_hub_fields" &&
      ctx.config.allowNotionApiFallback
    ) {
      await ctx.log("Webhook payload was sparse; fetching current Notion data.");
      result = await fallbackSync(payload);
    }

    if (result.skipped && result.upserted === 0 && result.hidden === 0) {
      throw new Error(`Link Hub sync skipped: ${result.skipped}`);
    }

    await ctx.log(
      `Link Hub sync ${result.mode}: ${result.upserted} upserted, ${result.hidden} hidden.`,
    );

    return {
      type: "output",
      outputs: {
        result,
        project: result.project ?? null,
        mode: result.mode,
        upserted: result.upserted,
        hidden: result.hidden,
      },
    };
  },
};
