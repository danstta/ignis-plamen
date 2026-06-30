import { z } from "zod";
import type { NodeMeta } from "../types";

export const findLocationImagesConfigSchema = z.object({
  locationQuery: z.string().default(""),
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
  inputs: [],
  outputs: [{ id: "candidates", label: "Candidates", kind: "data" }],
  configFields: [
    {
      name: "locationQuery",
      label: "Location query",
      type: "text",
      placeholder: "Venue name, address, or insert webhook data",
      help: "Build this from selected webhook fields, for example venue name plus address. Uses the server-side GOOGLE_MAPS_API_KEY.",
    },
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
