import type { NodeDefinition, NodeMeta } from "@/lib/nodes/types";

/**
 * A plugin is a togglable bundle of workflow node types that lives in the
 * top-level `plugins/` directory. Each plugin ships two entry points:
 *
 * - `plugin.ts` — a client-safe {@link PluginManifest}: plugin info plus its
 *   node metas (no run() implementations, so no server-only imports).
 * - `server.ts` — a {@link PluginServer}: the full node definitions with run().
 *
 * A node type appears in the canvas palette (and is allowed to run) only while
 * its owning plugin is enabled.
 */

/** Client-safe plugin descriptor: identity plus the node metas it contributes. */
export interface PluginManifest {
  /** Stable id, persisted as the `plugins` row primary key. */
  id: string;
  name: string;
  description: string;
  /** Node metas contributed by this plugin (drives palette, config panel, gating). */
  nodes: NodeMeta[];
  /** Seeded enabled on first sight (e.g. the built-in "core" plugin). */
  defaultEnabled?: boolean;
}

/** Server half of a plugin: the runnable definitions for its node metas. */
export interface PluginServer {
  /** Must match the manifest's id. */
  id: string;
  nodes: NodeDefinition[];
}

/**
 * Flattened plugin view used by the admin Plugins page and the enablement
 * service. Derived from manifests in `lib/plugins/registry` — node types are
 * referenced by id here so the service layer stays independent of node shapes.
 */
export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  /** Node-type ids contributed by this plugin. */
  nodeTypeIds: string[];
  defaultEnabled?: boolean;
}

/** A plugin paired with its current on/off state. */
export interface PluginState extends PluginDefinition {
  enabled: boolean;
}
