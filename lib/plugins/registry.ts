import { pluginManifests } from "@/plugins";
import type { PluginDefinition } from "./types";

/**
 * Flattened view of the installed plugin manifests (plugins/index.ts) for the
 * Plugins admin page and the enablement service. To ship a new plugin, add it
 * under plugins/ and register it there — this module derives everything else.
 */
const definitions: PluginDefinition[] = pluginManifests.map((m) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  nodeTypeIds: m.nodes.map((n) => n.id),
  defaultEnabled: m.defaultEnabled,
}));

const byId = new Map<string, PluginDefinition>();
for (const def of definitions) {
  if (byId.has(def.id)) {
    throw new Error(`Duplicate plugin id "${def.id}" in plugins/index.ts.`);
  }
  byId.set(def.id, def);
}

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
