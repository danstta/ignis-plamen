import type { NodeDefinition } from "@/lib/nodes/types";
import type { PluginServer } from "@/lib/plugins/types";
import { notionUpdatePageNode } from "./nodes/notion-update-page";
import { linkHubSupabaseSyncNode } from "./nodes/link-hub-supabase-sync";

export const notionPluginServer: PluginServer = {
  id: "notion",
  nodes: [
    notionUpdatePageNode as unknown as NodeDefinition,
    linkHubSupabaseSyncNode as unknown as NodeDefinition,
  ],
};
