import { z } from "zod";
import type { NodeMeta } from "../types";

export const CURATE_IMAGES_TYPE_ID = "curate-images";

export const curateImagesConfigSchema = z.object({
  mode: z.enum(["manual", "auto"]).default("manual"),
  selectionCount: z.coerce.number().int().min(1).max(50).default(10),
  alternateCount: z.coerce.number().int().min(1).max(50).default(15),
  templateId: z.string().default(""),
  placeholders: z.record(z.string(), z.unknown()).default({}),
});

export type CurateImagesConfig = z.infer<typeof curateImagesConfigSchema>;

export const curateImagesMeta: NodeMeta<CurateImagesConfig> = {
  id: CURATE_IMAGES_TYPE_ID,
  label: "Curate Images",
  description:
    "Pauses so you can swap similar images with alternates before continuing.",
  category: "control",
  group: "media",
  inputs: [{ id: "ranked", label: "Images", kind: "data" }],
  outputs: [
    { id: "ranked", label: "Curated images", kind: "data" },
    { id: "selected", label: "Selected images", kind: "data" },
    { id: "selectedUrls", label: "Selected image URLs", kind: "data" },
    { id: "templateData", label: "Template preview data", kind: "data" },
    { id: "best", label: "Best image", kind: "image" },
  ],
  configFields: [
    {
      name: "mode",
      label: "Curation mode",
      type: "select",
      options: [
        { value: "manual", label: "Manual - pause and let me curate" },
        { value: "auto", label: "Auto - use the top ranked images" },
      ],
    },
    {
      name: "selectionCount",
      label: "Selected images",
      type: "number",
      placeholder: "10",
    },
    {
      name: "alternateCount",
      label: "Alternates to show",
      type: "number",
      placeholder: "15",
    },
    {
      name: "templateId",
      label: "Template preview",
      type: "template",
      help: "Optional. Shows how the curated images will look in this template.",
    },
  ],
  configSchema: curateImagesConfigSchema,
};
