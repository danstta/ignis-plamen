import {
  readNotionWebhookSignal,
  signalMatchesConfiguredDataSource,
  type LinkHubPropertyKey,
  type LinkHubPropertyNames,
  type LinkHubPropertyValues,
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

const FIELD_BY_PROPERTY: Record<
  LinkHubPropertyKey,
  keyof Omit<LinkHubSupabaseSyncConfig, "allowNotionApiFallback">
> = {
  projectName: "projectNameProperty",
  infopackLink: "infopackLinkProperty",
  googleFormLink: "googleFormLinkProperty",
  projectCountry: "projectCountryProperty",
  showOnLinks: "showOnLinksProperty",
  callDeadline: "callDeadlineProperty",
  sortOrder: "sortOrderProperty",
};

const REFERENCE_TOKEN = /\{\{\s*[^}]+?\s*\}\}/;

function containsReference(value: unknown): boolean {
  return typeof value === "string" && REFERENCE_TOKEN.test(value);
}

function stringConfig(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function propertySources(
  config: LinkHubSupabaseSyncConfig,
  rawConfig?: Record<string, unknown>,
): { names: LinkHubPropertyNames; values: LinkHubPropertyValues } {
  const names: LinkHubPropertyNames = {};
  const values: LinkHubPropertyValues = {};

  for (const [key, field] of Object.entries(FIELD_BY_PROPERTY) as [
    LinkHubPropertyKey,
    keyof Omit<LinkHubSupabaseSyncConfig, "allowNotionApiFallback">,
  ][]) {
    const resolved = config[field];
    const raw = rawConfig?.[field];
    if (containsReference(raw)) {
      if (resolved !== undefined) values[key] = resolved;
      continue;
    }

    const name = stringConfig(resolved);
    if (name) {
      names[key] = name;
    } else if (resolved !== undefined) {
      values[key] = resolved;
    }
  }

  return { names, values };
}

async function fallbackSync(
  payload: unknown,
  names: LinkHubPropertyNames,
): Promise<LinkHubSyncResult> {
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
    return syncLinkHubPage(signal.pageId, names);
  }

  return syncLinkHubDataSource(names);
}

export const linkHubSupabaseSyncNode: NodeDefinition<LinkHubSupabaseSyncConfig> = {
  ...linkHubSupabaseSyncMeta,

  async run(ctx) {
    const payload = ctx.inputs.payload ?? ctx.trigger.body ?? ctx.trigger;
    const { names, values } = propertySources(ctx.config, ctx.rawConfig);

    await ctx.throwIfStopped?.();
    let result = await syncLinkHubPayload(payload, names, values);
    if (
      result.skipped === "payload_missing_link_hub_fields" &&
      ctx.config.allowNotionApiFallback
    ) {
      await ctx.log("Webhook payload was sparse; fetching current Notion data.");
      result = await fallbackSync(payload, names);
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
