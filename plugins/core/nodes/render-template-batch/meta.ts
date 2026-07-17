import { z } from "zod";
import type { NodeMeta } from "@/lib/nodes/types";

export const RENDER_TEMPLATE_BATCH_TYPE_ID = "render-template-batch";

export const renderTemplateBatchConfigSchema = z.object({
  templateId: z.string().default(""),
  count: z.coerce.number().int().min(1).max(50).default(5),
  imagePlaceholderKey: z.string().default(""),
  placeholders: z.record(z.string(), z.unknown()).default({}),
});

export type RenderTemplateBatchConfig = z.infer<
  typeof renderTemplateBatchConfigSchema
>;

export const renderTemplateBatchMeta: NodeMeta<RenderTemplateBatchConfig> = {
  id: RENDER_TEMPLATE_BATCH_TYPE_ID,
  label: "Render Template Batch",
  description:
    "Renders several template versions from an input image list and returns them as an array.",
  category: "output",
  group: "design",
  inputs: [{ id: "images", label: "Images", kind: "data" }],
  outputs: [
    { id: "designs", label: "Designs", kind: "data" },
    { id: "renderUrls", label: "Render URLs", kind: "data" },
    { id: "renderUrl", label: "First render URL", kind: "image" },
  ],
  configFields: [
    {
      name: "templateId",
      label: "Template",
      type: "template",
      help: "The design to render for each input image.",
    },
    {
      name: "count",
      label: "Versions to render",
      type: "number",
      placeholder: "5",
      help: "Uses the first N images from the input list.",
    },
    {
      name: "imagePlaceholderKey",
      label: "Image placeholder",
      type: "text",
      placeholder: "Defaults to the first image placeholder",
      help: "The template image placeholder that receives each input image.",
    },
  ],
  configSchema: renderTemplateBatchConfigSchema,
};
