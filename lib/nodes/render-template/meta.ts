import { z } from "zod";
import type { NodeMeta } from "../types";

export const renderTemplateConfigSchema = z.object({
  templateId: z.string().default(""),
  imagePlaceholderKey: z.string().default(""),
});

export type RenderTemplateConfig = z.infer<typeof renderTemplateConfigSchema>;

export const renderTemplateMeta: NodeMeta<RenderTemplateConfig> = {
  id: "render-template",
  label: "Render Template",
  description: "Fills a template's placeholders and renders the final PNG.",
  category: "output",
  inputs: [{ id: "image", label: "Image", kind: "image" }],
  outputs: [{ id: "renderUrl", label: "Render URL", kind: "image" }],
  configFields: [
    {
      name: "templateId",
      label: "Template",
      type: "template",
      help: "The design to render.",
    },
    {
      name: "imagePlaceholderKey",
      label: "Image placeholder key",
      type: "text",
      placeholder: "e.g. venue",
      help: "Which template image placeholder receives the chosen image.",
    },
  ],
  configSchema: renderTemplateConfigSchema,
};
