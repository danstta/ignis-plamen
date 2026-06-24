import { z } from "zod";
import type { NodeMeta } from "../types";

export const findLocationImagesConfigSchema = z.object({
  maxCandidates: z.coerce.number().int().min(1).max(10).default(5),
  maxWidthPx: z.coerce.number().int().min(200).max(4000).default(1200),
});

export type FindLocationImagesConfig = z.infer<
  typeof findLocationImagesConfigSchema
>;

export const findLocationImagesMeta: NodeMeta<FindLocationImagesConfig> = {
  id: "find-location-images",
  label: "Find Location Images",
  description: "Searches Google Places for real photos of the location.",
  category: "source",
  inputs: [{ id: "location", label: "Location", kind: "text" }],
  outputs: [{ id: "candidates", label: "Candidates", kind: "data" }],
  configFields: [
    {
      name: "maxCandidates",
      label: "Max candidates",
      type: "number",
      placeholder: "5",
    },
    {
      name: "maxWidthPx",
      label: "Max photo width (px)",
      type: "number",
      placeholder: "1200",
    },
  ],
  configSchema: findLocationImagesConfigSchema,
};
