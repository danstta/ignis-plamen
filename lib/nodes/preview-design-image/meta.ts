import { z } from "zod";
import type { NodeMeta } from "../types";

export const PREVIEW_DESIGN_IMAGE_TYPE_ID = "preview-design-image";

export const previewDesignImageConfigSchema = z.object({
  mode: z.enum(["manual", "auto"]).default("manual"),
  templateId: z.string().default(""),
  candidateCount: z.coerce.number().int().min(1).max(50).default(10),
  imagePlaceholderKey: z.string().default(""),
  placeholders: z.record(z.string(), z.unknown()).default({}),
});

export type PreviewDesignImageConfig = z.infer<
  typeof previewDesignImageConfigSchema
>;

export const previewDesignImageMeta: NodeMeta<PreviewDesignImageConfig> = {
  id: PREVIEW_DESIGN_IMAGE_TYPE_ID,
  label: "Preview Design Image",
  description:
    "Pauses so you can preview candidate images inside a selected design before locking one.",
  category: "control",
  group: "design",
  inputs: [{ id: "images", label: "Images", kind: "data" }],
  outputs: [
    { id: "chosen", label: "Locked image URL", kind: "image" },
    { id: "chosenImage", label: "Locked image", kind: "data" },
    { id: "templateData", label: "Preview template data", kind: "data" },
  ],
  configFields: [
    {
      name: "mode",
      label: "Selection mode",
      type: "select",
      options: [
        { value: "manual", label: "Manual - preview and lock one" },
        { value: "auto", label: "Auto - use the first image" },
      ],
    },
    {
      name: "templateId",
      label: "Preview design",
      type: "template",
      help: "The design used for the live preview.",
    },
    {
      name: "candidateCount",
      label: "Images to review",
      type: "number",
      placeholder: "10",
    },
    {
      name: "imagePlaceholderKey",
      label: "Dynamic image placeholder",
      type: "text",
      placeholder: "Defaults to the first unbound image placeholder",
      help: "This image placeholder is swapped instantly in the preview and locked as the node output.",
    },
  ],
  configSchema: previewDesignImageConfigSchema,
};
