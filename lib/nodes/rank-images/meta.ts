import { z } from "zod";
import type { NodeMeta } from "../types";

export const RANK_IMAGES_TYPE_ID = "rank-images";

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
      "Rate how strong each image is for the intended design or automation output. Prefer clear, high-quality, relevant images with strong composition, good lighting, useful subject framing, and no distracting text, watermarks, awkward crops, or low-resolution artifacts.",
    ),
  imagesPerCall: z.coerce.number().int().min(1).max(6).default(2),
  concurrentCalls: z.coerce.number().int().min(1).max(4).default(1),
  maxImages: z.coerce.number().int().min(1).max(500).default(100),
});

export type RankImagesConfig = z.infer<typeof rankImagesConfigSchema>;

export const rankImagesMeta: NodeMeta<RankImagesConfig> = {
  id: RANK_IMAGES_TYPE_ID,
  label: "Rank Images",
  description:
    "Rates supported public image URLs with vision and returns them sorted best-first.",
  category: "transform",
  group: "ai",
  inputs: [{ id: "candidates", label: "Images", kind: "data" }],
  outputs: [
    { id: "ranked", label: "Ranked images", kind: "data" },
    { id: "rankedUrls", label: "Ranked image URLs", kind: "data" },
    { id: "scores", label: "Image scores", kind: "data" },
    { id: "skipped", label: "Skipped images", kind: "data" },
    { id: "best", label: "Best image", kind: "image" },
    { id: "count", label: "Count", kind: "data" },
    { id: "skippedCount", label: "Skipped count", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "AI connection",
      type: "connection",
      connectionTypes: ["openai", "azure-foundry"],
      help: "Choose an OpenAI or Azure AI Foundry connection with a vision-capable model.",
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
      help: "Describe what makes one image better than another for this workflow.",
    },
    {
      name: "imagesPerCall",
      label: "Images per LLM call",
      type: "number",
      placeholder: "2",
      help: "Each batch creates one durable vision call. Unsupported formats are skipped before the model is called.",
    },
    {
      name: "concurrentCalls",
      label: "LLM calls at once",
      type: "number",
      placeholder: "1",
      help: "Controls how many rating calls run in parallel. 1 or 2 is safest for rate limits.",
    },
    {
      name: "maxImages",
      label: "Max images",
      type: "number",
      placeholder: "100",
      help: "Caps the number of incoming images this node will rate in one run.",
    },
  ],
  configSchema: rankImagesConfigSchema,
};
