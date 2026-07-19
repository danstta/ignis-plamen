import type { ConnectionDefinition } from "./types";
import { notionConnection } from "./notion";
import { tallyConnection } from "./tally";
import { googleDriveConnection } from "./google-drive";
import { openAIConnection } from "./openai";
import { anthropicConnection } from "./anthropic";
import { azureFoundryConnection } from "./azure-foundry";

/**
 * Registry of available connection providers ("apps"). To add an integration,
 * implement a ConnectionDefinition and add it here — the Settings → Connections
 * UI and the OAuth routes pick it up generically.
 */
const definitions: ConnectionDefinition[] = [
  googleDriveConnection as unknown as ConnectionDefinition,
  openAIConnection as unknown as ConnectionDefinition,
  anthropicConnection as unknown as ConnectionDefinition,
  azureFoundryConnection as unknown as ConnectionDefinition,
  notionConnection as unknown as ConnectionDefinition,
  tallyConnection as unknown as ConnectionDefinition,
];

const byId = new Map(definitions.map((d) => [d.id, d]));

export function listConnectionTypes(): ConnectionDefinition[] {
  return definitions;
}

export function getConnectionType(id: string): ConnectionDefinition | undefined {
  return byId.get(id);
}
