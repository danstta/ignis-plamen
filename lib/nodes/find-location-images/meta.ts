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
  description:
    "Searches Wikimedia Commons for real, reusable photos near the location.",
  category: "source",
  inputs: [],
  outputs: [{ id: "candidates", label: "Candidates", kind: "data" }],
  configFields: [
    {
      name: "locationQuery",
      label: "Location",
      type: "text",
      placeholder: "Venue name, address, or insert webhook data",
      help: "Insert webhook fields or type a venue, city, country, or address. Uses OpenStreetMap + Wikimedia Commons; no API key required.",
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
