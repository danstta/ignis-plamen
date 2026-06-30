import { z } from "zod";
import { AI_MODEL_CONNECTION_TYPES } from "@/lib/connections/model-options";
import type { NodeMeta } from "../types";

export const LLM_PROMPT_TYPE_ID = "llm-prompt";

export const llmPromptConfigSchema = z.object({
  connectionId: z.string().default(""),
  model: z.string().default(""),
  systemPrompt: z.string().default(""),
  prompt: z.string().default(""),
  temperature: z.coerce.number().min(0).max(2).default(0.4),
  maxTokens: z.coerce.number().int().min(1).max(8192).default(1000),
});

export type LlmPromptConfig = z.infer<typeof llmPromptConfigSchema>;

export const llmPromptMeta: NodeMeta<LlmPromptConfig> = {
  id: LLM_PROMPT_TYPE_ID,
  label: "LLM Prompt",
  description: "Calls an AI model with a custom prompt and returns generated text.",
  category: "transform",
  inputs: [{ id: "input", label: "Input", kind: "data" }],
  outputs: [
    { id: "text", label: "Text", kind: "text" },
    { id: "raw", label: "Raw response", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "AI connection",
      type: "connection",
      connectionTypes: [...AI_MODEL_CONNECTION_TYPES],
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
      name: "systemPrompt",
      label: "System prompt",
      type: "textarea",
      placeholder: "Optional instructions for the model",
    },
    {
      name: "prompt",
      label: "Prompt",
      type: "textarea",
      placeholder: "Write a prompt, or insert data from previous steps",
      help: "Use the Data button to insert webhook or previous-step fields.",
    },
    {
      name: "temperature",
      label: "Temperature",
      type: "number",
      placeholder: "0.4",
      help: "0 is more deterministic; higher values are more creative.",
    },
    {
      name: "maxTokens",
      label: "Max output tokens",
      type: "number",
      placeholder: "1000",
    },
  ],
  configSchema: llmPromptConfigSchema,
};
