import { z } from "zod";
import type { ConnectionDefinition } from "@/lib/connections/types";

const configSchema = z.object({
  apiKey: z.string().default(""),
});

type AnthropicConfig = z.infer<typeof configSchema>;

export const anthropicConnection: ConnectionDefinition<AnthropicConfig> = {
  id: "anthropic",
  name: "Claude",
  description: "Use an Anthropic API key to call Claude models from workflows.",
  auth: {
    type: "keys",
    fields: [
      {
        name: "apiKey",
        label: "Anthropic API key",
        type: "password",
        placeholder: "sk-ant-...",
        help: "Create an Anthropic Console key and paste it here. Workflow nodes can use it for Claude model calls.",
      },
    ],
  },
  configSchema,
};
