import type { ConnectionDefinition } from "./types";
import { notionConnection } from "./notion";
import { googleDriveConnection } from "./google-drive";

/**
 * Registry of available connection providers ("apps"). To add an integration,
 * implement a ConnectionDefinition and add it here — the Settings → Connections
 * UI and the OAuth routes pick it up generically.
 */
const definitions: ConnectionDefinition[] = [
  notionConnection as unknown as ConnectionDefinition,
  googleDriveConnection as unknown as ConnectionDefinition,
];

const byId = new Map(definitions.map((d) => [d.id, d]));

export function listConnectionTypes(): ConnectionDefinition[] {
  return definitions;
}

export function getConnectionType(id: string): ConnectionDefinition | undefined {
  return byId.get(id);
}
