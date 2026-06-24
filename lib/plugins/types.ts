/**
 * A plugin is a togglable bundle of features. Today every plugin contributes one
 * or more workflow node types: a node type appears in the canvas palette (and is
 * allowed to run) only while its owning plugin is enabled.
 *
 * Plugins reference node types by id (strings) rather than importing the node
 * registry, keeping this module free of cycles.
 */
export interface PluginDefinition {
  /** Stable id, persisted as the `plugins` row primary key. */
  id: string;
  name: string;
  description: string;
  /** Node-type ids contributed by this plugin (see lib/nodes/registry). */
  nodeTypeIds: string[];
  /** Seeded enabled on first sight (e.g. the built-in "core" plugin). */
  defaultEnabled?: boolean;
}

/** A plugin paired with its current on/off state. */
export interface PluginState extends PluginDefinition {
  enabled: boolean;
}
