import { z } from "zod";
import type { ConnectionDefinition } from "@/lib/connections/types";

const configSchema = z.object({
  endpoint: z.string().default(""),
  apiKey: z.string().default(""),
  deploymentName: z.string().default(""),
  apiVersion: z.string().optional().default(""),
});

type AzureFoundryConfig = z.infer<typeof configSchema>;

export const azureFoundryConnection: ConnectionDefinition<AzureFoundryConfig> =
  {
    id: "azure-foundry",
    name: "Azure AI Foundry",
    description:
      "Connect to Azure AI Foundry model deployments with endpoint, key, and deployment names.",
    auth: {
      type: "keys",
      fields: [
        {
          name: "endpoint",
          label: "Endpoint",
          type: "text",
          placeholder: "https://your-resource.openai.azure.com",
          help: "Use the endpoint for the Azure AI Foundry or Azure OpenAI resource that hosts the deployment.",
        },
        {
          name: "apiKey",
          label: "API key",
          type: "password",
          placeholder: "Paste Azure key",
          help: "Store one of the resource keys from Azure. Rotate it in Azure if it is ever exposed.",
        },
        {
          name: "deploymentName",
          label: "Deployment names",
          type: "model-list",
          placeholder: "gpt-4.1-mini-production",
          itemLabel: "deployment",
          help: "Add each Azure deployment name that workflow nodes can select.",
        },
        {
          name: "apiVersion",
          label: "API version",
          type: "text",
          placeholder: "2025-01-01-preview",
          required: false,
          help: "Optional. Leave blank to let a node choose its default Azure API version.",
        },
      ],
    },
    configSchema,
  };
