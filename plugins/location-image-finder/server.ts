import type { NodeDefinition } from "@/lib/nodes/types";
import type { PluginServer } from "@/lib/plugins/types";
import { findLocationImagesNode } from "./nodes/find-location-images";
import { rankImagesNode } from "./nodes/rank-images";

export const locationImageFinderPluginServer: PluginServer = {
  id: "location-image-finder",
  nodes: [
    findLocationImagesNode as unknown as NodeDefinition,
    rankImagesNode as unknown as NodeDefinition,
  ],
};
