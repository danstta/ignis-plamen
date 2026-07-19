import type { PluginServer } from "@/lib/plugins/types";
import { corePluginServer } from "./core/server";
import { aiPluginServer } from "./ai/server";
import { notionPluginServer } from "./notion/server";
import { tallyPluginServer } from "./tally/server";
import { googleDrivePluginServer } from "./google-drive/server";
import { locationImageFinderPluginServer } from "./location-image-finder/server";

/**
 * Server-side plugin registry: the runnable node definitions behind every
 * manifest in ./index. Server-only — importing this pulls in db/storage/render
 * code, so it must never be reached from a client component (the engine and
 * node registry are its only consumers).
 */
export const pluginServers: PluginServer[] = [
  corePluginServer,
  aiPluginServer,
  notionPluginServer,
  tallyPluginServer,
  googleDrivePluginServer,
  locationImageFinderPluginServer,
];
