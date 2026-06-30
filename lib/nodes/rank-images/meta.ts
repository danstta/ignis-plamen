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
      "Pick clear, attractive photos that best represent the venue for a 'Call for participants' social post. Prefer well-lit, uncluttered, recognizable shots.",
    ),
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
  ],
  configSchema: rankImagesConfigSchema,
};
