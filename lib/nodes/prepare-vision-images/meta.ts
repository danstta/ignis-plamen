import { z } from "zod";
import type { NodeMeta } from "../types";

export const PREPARE_VISION_IMAGES_TYPE_ID = "prepare-vision-images";

export const prepareVisionImagesConfigSchema = z.object({
  connectionId: z.string().default(""),
  maxImages: z.coerce.number().int().min(1).max(500).default(100),
  jpegQuality: z.coerce.number().int().min(50).max(95).default(84),
  storagePrefix: z.string().default("vision-images"),
});

export type PrepareVisionImagesConfig = z.infer<
  typeof prepareVisionImagesConfigSchema
>;

export const prepareVisionImagesMeta: NodeMeta<PrepareVisionImagesConfig> = {
  id: PREPARE_VISION_IMAGES_TYPE_ID,
  label: "Prepare Vision Images",
  description:
    "Standardizes Drive image links for vision nodes, converting HEIC images once and storing JPEG links.",
  category: "transform",
  group: "google-drive",
  inputs: [{ id: "images", label: "Images", kind: "data" }],
  outputs: [
    { id: "images", label: "Prepared images", kind: "data" },
    { id: "urls", label: "Prepared image URLs", kind: "data" },
    { id: "converted", label: "Converted images", kind: "data" },
    { id: "skipped", label: "Skipped images", kind: "data" },
    { id: "firstImage", label: "First image", kind: "image" },
    { id: "count", label: "Count", kind: "data" },
    { id: "convertedCount", label: "Converted count", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "Google Drive connection",
      type: "connection",
      connectionTypes: ["google-drive"],
      help: "Used to fetch original HEIC bytes from Drive when the incoming image includes a Drive file ID.",
    },
    {
      name: "maxImages",
      label: "Max images",
      type: "number",
      placeholder: "100",
      help: "Caps how many incoming image links this node prepares.",
    },
    {
      name: "jpegQuality",
      label: "JPEG quality",
      type: "number",
      placeholder: "84",
      help: "Quality used when converting HEIC images to JPEG.",
    },
    {
      name: "storagePrefix",
      label: "Storage prefix",
      type: "text",
      placeholder: "vision-images",
      help: "Folder prefix for converted JPEGs in Supabase Storage.",
    },
  ],
  configSchema: prepareVisionImagesConfigSchema,
};
