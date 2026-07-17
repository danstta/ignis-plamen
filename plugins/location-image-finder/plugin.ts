import type { NodeMeta } from "@/lib/nodes/types";
import type { PluginManifest } from "@/lib/plugins/types";
import { findLocationImagesMeta } from "./nodes/find-location-images/meta";
import { rankImagesMeta } from "./nodes/rank-images/meta";

export const locationImageFinderPlugin: PluginManifest = {
  id: "location-image-finder",
  name: "Location Image Finder",
  description:
    "Finds reusable location photos (OpenStreetMap + Wikimedia Commons) and ranks them with GPT vision.",
  nodes: [
    findLocationImagesMeta as unknown as NodeMeta,
    rankImagesMeta as unknown as NodeMeta,
  ],
};
