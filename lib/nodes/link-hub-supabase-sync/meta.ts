import { z } from "zod";
import type { NodeMeta } from "../types";

export const LINK_HUB_SUPABASE_SYNC_TYPE_ID = "link-hub-supabase-sync";

export const linkHubSupabaseSyncConfigSchema = z.object({
  allowNotionApiFallback: z.boolean().default(true),
});

export type LinkHubSupabaseSyncConfig = z.infer<
  typeof linkHubSupabaseSyncConfigSchema
>;

export const linkHubSupabaseSyncMeta: NodeMeta<LinkHubSupabaseSyncConfig> = {
  id: LINK_HUB_SUPABASE_SYNC_TYPE_ID,
  label: "Sync Link Hub",
  description:
    "Upserts Link Hub project rows into Supabase from a Notion webhook payload.",
  category: "output",
  group: "notion",
  inputs: [{ id: "payload", label: "Payload", kind: "data" }],
  outputs: [
    { id: "result", label: "Result", kind: "data" },
    { id: "project", label: "Project row", kind: "data" },
    { id: "mode", label: "Mode", kind: "text" },
    { id: "upserted", label: "Upserted", kind: "data" },
    { id: "hidden", label: "Hidden", kind: "data" },
  ],
  configFields: [
    {
      name: "allowNotionApiFallback",
      label: "Use Notion API fallback",
      type: "boolean",
      defaultValue: true,
      help: "When the webhook only contains a page/data source id, fetch the latest properties from Notion before writing Supabase.",
    },
  ],
  configSchema: linkHubSupabaseSyncConfigSchema,
};
