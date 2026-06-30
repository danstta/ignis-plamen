import { z } from "zod";
import type { ConnectionDefinition } from "@/lib/connections/types";

const configSchema = z.object({
  apiKey: z.string().default(""),
  organizationId: z.string().optional().default(""),
  projectId: z.string().optional().default(""),
  models: z.string().optional().default(""),
});

type OpenAIConfig = z.infer<typeof configSchema>;

export const openAIConnection: ConnectionDefinition<OpenAIConfig> = {
  id: "openai",
  name: "OpenAI",
  description: "Use an OpenAI API key for generation, vision, and model calls.",
  auth: {
    type: "keys",
    fields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "sk-...",
        help: "Store a project API key. It will be used by workflow nodes that call OpenAI models.",
      },
      {
        name: "organizationId",
        label: "Organization ID",
        type: "text",
        placeholder: "org_...",
        required: false,
        help: "Optional. Add this only when your account needs an explicit OpenAI organization.",
      },
      {
        name: "projectId",
        label: "Project ID",
        type: "text",
        placeholder: "proj_...",
        required: false,
        help: "Optional. Use this to pin requests to a specific OpenAI project.",
      },
      {
        name: "models",
        label: "Models",
        type: "text",
        placeholder: "gpt-4.1-mini, gpt-4.1",
        required: false,
        help: "Comma-separated model IDs to expose in workflow nodes.",
      },
    ],
  },
  configSchema,
};
