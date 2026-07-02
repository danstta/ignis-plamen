import { z } from "zod";
import type { NodeMeta } from "../types";

export const renderTemplateConfigSchema = z.object({
  templateId: z.string().default(""),
  /**
   * Binding per template placeholder key -> value. Values are literal text or
   * `{{nodeId.path}}` tokens, resolved against upstream outputs before run().
   * Image placeholders bind to an image URL the same way. Replaces the legacy
   * single `image` input + `imagePlaceholderKey` field.
   */
  placeholders: z.record(z.string(), z.unknown()).default({}),
});

export type RenderTemplateConfig = z.infer<typeof renderTemplateConfigSchema>;

export const renderTemplateMeta: NodeMeta<RenderTemplateConfig> = {
  id: "render-template",
  label: "Render Template",
  description: "Fills a template's placeholders and renders the final PNG.",
  category: "output",
  group: "design",
  inputs: [],
  outputs: [
    // First page, kept for single-image consumers and backward compatibility.
    { id: "renderUrl", label: "Render URL", kind: "image" },
    // Every rendered page, in order (one entry per design page).
    { id: "renderUrls", label: "Render URLs (all pages)", kind: "data" },
  ],
  // The template select is generic; the per-placeholder binding rows are
  // rendered specially by the config panel (they depend on the chosen template).
  configFields: [
    {
      name: "templateId",
      label: "Template",
      type: "template",
      help: "The design to render.",
    },
  ],
  configSchema: renderTemplateConfigSchema,
};
