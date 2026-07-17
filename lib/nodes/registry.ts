import { pluginServers } from "@/plugins/server";
import type { NodeDefinition } from "./types";

/**
 * Server registry of runnable workflow node types, flattened from the plugin
 * server bundles in plugins/server.ts. To add a node, implement it inside a
 * plugin (see plugins/README.md) — the canvas palette, config panel, and engine
 * pick it up. Gating by enabled plugins happens in lib/plugins/service.
 */
const definitions: NodeDefinition[] = pluginServers.flatMap((p) => p.nodes);

const byId = new Map<string, NodeDefinition>();
for (const def of definitions) {
  for (const id of [def.id, ...(def.aliases ?? [])]) byId.set(id, def);
}

export function listNodeTypes(): NodeDefinition[] {
  return definitions;
}

/** Resolves the id or a legacy alias (see NodeMeta.aliases). */
export function getNodeType(id: string): NodeDefinition | undefined {
  return byId.get(id);
}
