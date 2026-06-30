import { z } from "zod";
import type { NodeMeta } from "../types";

export const rehostImageConfigSchema = z.object({
  /**
   * Source image URL to copy into our own storage. Normally a single `{{token}}`
   * pointing at an upstream field that carries an expiring URL, e.g. a Notion
   * file property:
   *   `{{<webhookId>.body.data.properties.Photo.files.0.file.url}}`
   */
  source: z.string().default(""),
});

export type RehostImageConfig = z.infer<typeof rehostImageConfigSchema>;

export const rehostImageMeta: NodeMeta<RehostImageConfig> = {
  id: "rehost-image",
  label: "Rehost Image",
  description:
    "Copies an image from an expiring URL (e.g. a Notion file) into permanent storage, so a later step can't break when the source link expires.",
  category: "transform",
  inputs: [],
  // Stable, permanent URL. Bind a downstream image placeholder to
  // `{{<thisNodeId>.url}}` instead of the raw (expiring) source token.
  outputs: [{ id: "url", label: "Image URL", kind: "image" }],
  configFields: [
    {
      name: "source",
      label: "Source image URL",
      type: "text",
      placeholder: "{{...}} - insert the upstream image field",
      help: "The expiring/source URL to copy. Bind it to an upstream field (e.g. a Notion file URL) with Insert.",
    },
  ],
  configSchema: rehostImageConfigSchema,
};
