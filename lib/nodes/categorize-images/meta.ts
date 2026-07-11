import { z } from "zod";
import type { NodeMeta } from "../types";

export const CATEGORIZE_IMAGES_TYPE_ID = "categorize-images";

export const DEFAULT_CATEGORIZE_IMAGES_SYSTEM_PROMPT =
  "You are a precise vision categorization assistant for an automation builder. Categorize every image into exactly one of the user-provided categories. Use the image content and metadata only. Never invent, rename, merge, or output a category outside the allowed list. If multiple categories fit, choose the closest category according to the user's categorization prompt. If uncertain, still choose the closest allowed category. Return only JSON that matches the requested schema.";

export const DEFAULT_CATEGORIZE_IMAGES_PROMPT =
  "Categorize images by their primary visual purpose for downstream design curation. Prefer the category that would be most useful when selecting images for a template or campaign.";

export const DEFAULT_CATEGORIZE_IMAGES_CATEGORIES = [
  "Hero",
  "Lifestyle",
  "People",
  "Environment",
  "Detail",
  "Other",
].join("\n");

export const categorizeImagesConfigSchema = z.object({
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
  systemPrompt: z.string().default(DEFAULT_CATEGORIZE_IMAGES_SYSTEM_PROMPT),
  prompt: z.string().default(DEFAULT_CATEGORIZE_IMAGES_PROMPT),
  categories: z.string().default(DEFAULT_CATEGORIZE_IMAGES_CATEGORIES),
  imagesPerCall: z.coerce.number().int().min(1).max(6).default(1),
  concurrentCalls: z.coerce.number().int().min(1).max(4).default(2),
  maxImages: z.coerce.number().int().min(1).max(500).default(100),
});

export type CategorizeImagesConfig = z.infer<
  typeof categorizeImagesConfigSchema
>;

export const categorizeImagesMeta: NodeMeta<CategorizeImagesConfig> = {
  id: CATEGORIZE_IMAGES_TYPE_ID,
  label: "Categorize Images",
  description:
    "Assigns each image to one of your categories with vision and preserves the category downstream.",
  category: "transform",
  group: "ai",
  inputs: [{ id: "candidates", label: "Images", kind: "data" }],
  outputs: [
    { id: "categorized", label: "Categorized images", kind: "data" },
    { id: "categorizedUrls", label: "Categorized image URLs", kind: "data" },
    { id: "categoryGroups", label: "Category groups", kind: "data" },
    { id: "categorySummary", label: "Category summary", kind: "data" },
    { id: "skipped", label: "Skipped images", kind: "data" },
    { id: "count", label: "Count", kind: "data" },
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
      name: "categories",
      label: "Categories",
      type: "textarea",
      help: "List allowed categories, one per line. The node will never output categories outside this list.",
    },
    {
      name: "prompt",
      label: "Categorization prompt",
      type: "textarea",
      help: "Describe how the model should decide which category fits each image.",
    },
    {
      name: "systemPrompt",
      label: "System prompt",
      type: "textarea",
      help: "Controls the model's role and strict category behavior.",
    },
    {
      name: "imagesPerCall",
      label: "Images per LLM call",
      type: "number",
      placeholder: "1",
      help: "Each batch creates one durable vision call. Use 1 for per-image failure isolation, or 2+ for fewer calls.",
    },
    {
      name: "concurrentCalls",
      label: "LLM calls at once",
      type: "number",
      placeholder: "2",
      help: "Controls how many categorization calls run in parallel. 1 or 2 is safest for rate limits.",
    },
    {
      name: "maxImages",
      label: "Max images",
      type: "number",
      placeholder: "100",
      help: "Caps the number of incoming images this node will categorize in one run.",
    },
  ],
  configSchema: categorizeImagesConfigSchema,
};
