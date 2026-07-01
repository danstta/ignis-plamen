import { z } from "zod";
import type { NodeMeta } from "../types";

export const rankImagesConfigSchema = z.object({
  connectionId: z.string().default(""),
  model: z
    .preprocess(
      (value) =>
        value === "gpt-4o" || value === "gpt-4o-mini"
          ? "gpt-4.1-mini"
          : value,
      z.coerce.string(),
    )
    .default(""),
  criteria: z
    .string()
    .default(
      "Pick the best poster hero image for a youth exchange call. Prefer polished travel/destination photos: wide landscape or aerial city views, recognizable landmarks, waterfronts, mountains, old towns, castles, churches, plazas, gardens, or scenic architecture. Favor bright daylight, blue sky, vivid natural color, strong depth, clean composition, and enough open space for overlay text. Avoid dark interiors, close-up details, random people, cars as the subject, low-resolution/archive-looking images, screenshots, logos, watermarks, text in the photo, awkward crops, and dull or cluttered street snapshots.",
    ),
  selectionCount: z.coerce.number().int().min(1).max(50).default(5),
});

export type RankImagesConfig = z.infer<typeof rankImagesConfigSchema>;

export const rankImagesMeta: NodeMeta<RankImagesConfig> = {
  id: "rank-images",
  label: "Rank Images",
  description: "Ranks candidate photos with GPT vision against your criteria.",
  category: "transform",
  inputs: [
    { id: "candidates", label: "Candidates", kind: "data" },
    { id: "location", label: "Location", kind: "text" },
  ],
  outputs: [
    { id: "ranked", label: "Ranked images", kind: "data" },
    { id: "selected", label: "Selected ranked images", kind: "data" },
    { id: "selectedUrls", label: "Selected image URLs", kind: "data" },
    { id: "best", label: "Best image", kind: "image" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "AI connection",
      type: "connection",
      connectionTypes: ["openai", "azure-foundry"],
      help: "Choose an OpenAI or Azure AI Foundry connection.",
    },
    {
      name: "model",
      label: "Model",
      type: "select",
      options: [],
      modelSource: { connectionField: "connectionId" },
      help: "Models come from the selected connection's configured model list.",
    },
    {
      name: "criteria",
      label: "Ranking criteria",
      type: "textarea",
      help: "What makes a good image for this post.",
    },
    {
      name: "selectionCount",
      label: "Images to expose",
      type: "number",
      placeholder: "5",
      help: "Makes the first N ranked images available as Selected ranked images and Selected image URLs.",
    },
  ],
  configSchema: rankImagesConfigSchema,
};
