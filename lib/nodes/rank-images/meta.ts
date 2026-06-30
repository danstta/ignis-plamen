import { z } from "zod";
import type { NodeMeta } from "../types";

export const rankImagesConfigSchema = z.object({
  model: z
    .preprocess(
      (value) =>
        value === "gpt-4o" || value === "gpt-4o-mini"
          ? "gpt-4.1-mini"
          : value,
      z.enum(["gpt-4.1", "gpt-4.1-mini"]),
    )
    .default("gpt-4.1-mini"),
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
      name: "model",
      label: "Model",
      type: "select",
      options: [
        { value: "gpt-4.1", label: "gpt-4.1 (higher quality)" },
        { value: "gpt-4.1-mini", label: "gpt-4.1-mini (cheaper)" },
      ],
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
