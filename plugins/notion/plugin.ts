import type { NodeMeta } from "@/lib/nodes/types";
import type { PluginManifest } from "@/lib/plugins/types";
import { notionUpdatePageMeta } from "./nodes/notion-update-page/meta";
import { linkHubSupabaseSyncMeta } from "./nodes/link-hub-supabase-sync/meta";

export const notionPlugin: PluginManifest = {
  id: "notion",
  name: "Notion",
  description:
    "Updates Notion pages and syncs Notion payloads into public Link Hub rows.",
  defaultEnabled: true,
  nodes: [
    notionUpdatePageMeta as unknown as NodeMeta,
    linkHubSupabaseSyncMeta as unknown as NodeMeta,
  ],
};
