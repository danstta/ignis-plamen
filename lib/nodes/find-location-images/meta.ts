import { z } from "zod";
import type { NodeMeta } from "../types";

export const findLocationImageProviders = [
  "wikimedia",
  "openverse",
  "pexels",
  "wikimedia-openverse",
  "pexels-wikimedia",
] as const;

export const findLocationImagesConfigSchema = z.object({
  provider: z.enum(findLocationImageProviders).default("wikimedia"),
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
    "Searches free/open image sources for real, reusable photos near the location.",
  category: "source",
  inputs: [],
  outputs: [{ id: "candidates", label: "Candidates", kind: "data" }],
  configFields: [
    {
      name: "provider",
      label: "Provider",
      type: "select",
      options: [
        { value: "wikimedia", label: "Wikimedia Commons" },
        { value: "openverse", label: "Openverse" },
        { value: "pexels", label: "Pexels" },
        { value: "wikimedia-openverse", label: "Wikimedia + Openverse" },
        { value: "pexels-wikimedia", label: "Pexels + Wikimedia" },
      ],
      help: "Pexels usually gives the most polished poster-style travel photos. Wikimedia keeps precise nearby geotagged search. Openverse is broad but quality varies.",
    },
    {
      name: "locationQuery",
      label: "Location",
      type: "text",
      placeholder: "Venue name, address, or insert webhook data",
      help: "Insert webhook fields or type a venue, city, country, or address. Pexels requires PEXELS_API_KEY; Wikimedia and Openverse do not.",
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
