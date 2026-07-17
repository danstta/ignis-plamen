import { pluginManifests } from "@/plugins";
import type { NodeMeta } from "./types";

/**
 * Client-safe node catalog: metadata only (no run()), flattened from the plugin
 * manifests in plugins/index.ts, so the canvas palette, node renderer, config
 * panel, and store can import it without dragging server-only modules (db,
 * storage, renderer) into the browser bundle. The full server registry lives
 * in ./registry.
 */
const catalog: NodeMeta[] = pluginManifests.flatMap((p) => p.nodes);

const byId = new Map<string, NodeMeta>();
for (const meta of catalog) {
  if (byId.has(meta.id)) {
    throw new Error(
      `Duplicate node type id "${meta.id}" — two plugins contribute a node with the same id.`,
    );
  }
  byId.set(meta.id, meta);
}

export function listNodeCatalog(): NodeMeta[] {
  return catalog;
}

export function getNodeMeta(id: string): NodeMeta | undefined {
  return byId.get(id);
}

/**
 * Display label for a placed workflow node: its custom name when set, else the
 * node type's label. Every surface that shows a step name (canvas card, config
 * panel, token pickers, test results, run detail, engine logs) goes through
 * this so renames apply everywhere consistently.
 */
export function nodeDisplayLabel(node: { type: string; name?: string }): string {
  return node.name?.trim() || getNodeMeta(node.type)?.label || node.type;
}
