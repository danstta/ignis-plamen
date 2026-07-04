import { z } from "zod";
import type { NodeMeta } from "../types";

export const locationImageProviders = [
  "google-places",
  "wikimedia",
  "openverse",
  "pexels",
] as const;

export const legacyProviderMap: Record<string, (typeof locationImageProviders)[number][]> = {
  "google-places": ["google-places"],
  "google-places-wikimedia": ["google-places", "wikimedia"],
  "wikimedia-strict": ["wikimedia"],
  wikimedia: ["wikimedia"],
  openverse: ["openverse"],
  pexels: ["pexels"],
  "wikimedia-openverse": ["wikimedia", "openverse"],
  "pexels-wikimedia": ["pexels", "wikimedia"],
};

const baseFindLocationImagesConfigSchema = z.object({
  providers: z
    .array(z.enum(locationImageProviders))
    .min(1)
    .default(["wikimedia"]),
  locationQuery: z.string().default(""),
  resultsPerProvider: z.coerce.number().int().min(1).max(10).default(5),
  maxWidthPx: z.coerce.number().int().min(200).max(4000).default(1200),
});

export const findLocationImagesConfigSchema = z.preprocess((value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const config = { ...(value as Record<string, unknown>) };
  if (!Array.isArray(config.providers)) {
    const legacyProvider = typeof config.provider === "string" ? config.provider : "";
    config.providers = legacyProviderMap[legacyProvider] ?? undefined;
  }
  if (config.resultsPerProvider === undefined && config.maxCandidates !== undefined) {
    config.resultsPerProvider = config.maxCandidates;
  }
  return config;
}, baseFindLocationImagesConfigSchema);

export type FindLocationImagesConfig = z.infer<
  typeof findLocationImagesConfigSchema
>;

export const findLocationImagesMeta: NodeMeta<FindLocationImagesConfig> = {
  id: "find-location-images",
  label: "Find Location Images",
  description:
    "Searches free/open image sources for real, reusable photos near the location.",
  category: "source",
  group: "media",
  inputs: [],
  outputs: [{ id: "candidates", label: "Candidates", kind: "data" }],
  configFields: [
    {
      name: "providers",
      label: "Providers",
      type: "checkbox-group",
      options: [
        { value: "google-places", label: "Google Places" },
        { value: "wikimedia", label: "Wikimedia Commons" },
        { value: "openverse", label: "Openverse" },
        { value: "pexels", label: "Pexels" },
      ],
      defaultValue: ["wikimedia"],
      legacyValueMap: { field: "provider", values: legacyProviderMap },
      help: "Google Places is the most location-anchored option and requires GOOGLE_MAPS_API_KEY. Pexels requires PEXELS_API_KEY. Wikimedia and Openverse do not require keys.",
    },
    {
      name: "resultsPerProvider",
      label: "Results per provider",
      type: "number",
      placeholder: "5",
      legacyValueField: "maxCandidates",
      help: "Each selected provider can add up to this many candidates to the output array.",
    },
    {
      name: "locationQuery",
      label: "Location",
      type: "text",
      placeholder: "Venue name, address, or insert webhook data",
      help: "Insert webhook fields or type a venue, city, country, or address. Google Places requires GOOGLE_MAPS_API_KEY; Pexels requires PEXELS_API_KEY; Wikimedia and Openverse do not.",
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
