import type { PluginDefinition } from "./types";

/**
 * Registry of available plugins. To ship a new togglable feature, add its node
 * types to lib/nodes and list their ids on a plugin here — the Plugins admin page
 * and the canvas palette pick it up generically.
 */
const definitions: PluginDefinition[] = [
  {
    id: "core",
    name: "Core",
    description:
      "Built-in workflow nodes: webhook trigger, image rehosting, manual review, and template rendering.",
    nodeTypeIds: [
      "webhook",
      "rehost-image",
      "manual-review",
      "curate-images",
      "render-template",
      "render-template-batch",
      "preview-design-image",
      "review-designs",
      "run-link",
    ],
    defaultEnabled: true,
  },
  {
    id: "location-image-finder",
    name: "Location Image Finder",
    description:
      "Finds reusable location photos (OpenStreetMap + Wikimedia Commons) and ranks them with GPT vision.",
    nodeTypeIds: ["find-location-images", "rank-images"],
  },
  {
    id: "ai",
    name: "AI",
    description: "Calls configured AI model connections from workflows.",
    nodeTypeIds: ["llm-prompt", "categorize-images"],
    defaultEnabled: true,
  },
  {
    id: "notion",
    name: "Notion",
    description:
      "Updates Notion pages and syncs Notion payloads into public Link Hub rows.",
    nodeTypeIds: ["notion-update-page", "link-hub-supabase-sync"],
    defaultEnabled: true,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Reads and writes Google Drive folders and files from workflows.",
    nodeTypeIds: [
      "google-drive-list-images",
      "prepare-vision-images",
      "google-drive-upload-files",
    ],
    defaultEnabled: true,
  },
];

const byId = new Map(definitions.map((d) => [d.id, d]));

export function listPlugins(): PluginDefinition[] {
  return definitions;
}

export function getPlugin(id: string): PluginDefinition | undefined {
  return byId.get(id);
}

/** Reverse lookup: node-type id -> the plugin that owns it. */
const pluginByNodeType = new Map<string, PluginDefinition>();
for (const def of definitions) {
  for (const nodeTypeId of def.nodeTypeIds) {
    pluginByNodeType.set(nodeTypeId, def);
  }
}

export function getPluginForNodeType(
  nodeTypeId: string,
): PluginDefinition | undefined {
  return pluginByNodeType.get(nodeTypeId);
}
