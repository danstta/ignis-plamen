import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plugins } from "@/lib/db/schema";
import { listPlugins, getPluginForNodeType } from "./registry";
import type { PluginState } from "./types";

/**
 * Join the static registry against persisted on/off rows. A plugin with no row
 * falls back to its `defaultEnabled` (so "core" is on out of the box and feature
 * plugins are off until opted in).
 */
export async function listPluginStates(): Promise<PluginState[]> {
  const rows = await db().select().from(plugins);
  const enabledById = new Map(rows.map((r) => [r.id, r.enabled]));
  return listPlugins().map((def) => ({
    ...def,
    enabled: enabledById.get(def.id) ?? def.defaultEnabled ?? false,
  }));
}

/** Whether a single plugin is currently enabled. */
export async function isPluginEnabled(id: string): Promise<boolean> {
  const rows = await db()
    .select({ enabled: plugins.enabled })
    .from(plugins)
    .where(eq(plugins.id, id))
    .limit(1);
  if (rows[0]) return rows[0].enabled;
  return listPlugins().find((p) => p.id === id)?.defaultEnabled ?? false;
}

/** Upsert the on/off state for a plugin. */
export async function setPluginEnabled(id: string, enabled: boolean) {
  await db()
    .insert(plugins)
    .values({ id, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: plugins.id,
      set: { enabled, updatedAt: new Date() },
    });
}

/** Set of node-type ids whose owning plugin is enabled (gates palette + runs). */
export async function enabledNodeTypeIds(): Promise<Set<string>> {
  const states = await listPluginStates();
  const ids = new Set<string>();
  for (const s of states) {
    if (s.enabled) for (const nodeTypeId of s.nodeTypeIds) ids.add(nodeTypeId);
  }
  return ids;
}

/** True when the plugin owning `nodeTypeId` is enabled (used by the engine). */
export async function isNodeTypeEnabled(nodeTypeId: string): Promise<boolean> {
  const owner = getPluginForNodeType(nodeTypeId);
  if (!owner) return false;
  return isPluginEnabled(owner.id);
}
