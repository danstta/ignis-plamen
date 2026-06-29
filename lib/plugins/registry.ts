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
    nodeTypeIds: ["webhook", "rehost-image", "manual-review", "render-template"],
    defaultEnabled: true,
  },
  {
    id: "location-image-finder",
    name: "Location Image Finder",
    description:
      "Finds real photos of a location (Google Places) and ranks them with GPT vision.",
    nodeTypeIds: ["find-location-images", "rank-images"],
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
