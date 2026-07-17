import type { PluginManifest } from "@/lib/plugins/types";
import { corePlugin } from "./core/plugin";
import { aiPlugin } from "./ai/plugin";
import { notionPlugin } from "./notion/plugin";
import { googleDrivePlugin } from "./google-drive/plugin";
import { locationImageFinderPlugin } from "./location-image-finder/plugin";

/**
 * Client-safe plugin registry: every installed plugin's manifest (metadata +
 * node metas, no run() implementations). To install a plugin, add its
 * `plugin.ts` here and its `server.ts` to ./server — everything else (palette,
 * config panel, Plugins admin page, engine gating) picks it up from these two
 * lists. See plugins/README.md for the full guide.
 */
export const pluginManifests: PluginManifest[] = [
  corePlugin,
  aiPlugin,
  notionPlugin,
  googleDrivePlugin,
  locationImageFinderPlugin,
];
