import { getConnection } from "@/lib/connections/service";
import { modelOptionsForConnection } from "@/lib/connections/model-options";
import type { NodeDefinition } from "../types";
import { llmPromptMeta, type LlmPromptConfig } from "./meta";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatCompletionResponse = {
  choices?: { message?: { content?: string | null } }[];
  usage?: unknown;
  id?: string;
  model?: string;
};

function valueToPromptText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function buildMessages(config: LlmPromptConfig, input: unknown): ChatMessage[] {
  const prompt = config.prompt.trim();
  const inputText = valueToPromptText(input).trim();
  const messages: ChatMessage[] = [];
  const systemPrompt = config.systemPrompt.trim();

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({
    role: "user",
    content: [prompt, inputText ? `Input:\n${inputText}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  });

  return messages;
}

async function parseChatResponse(
  res: Response,
  provider: string,
): Promise<{ text: string; raw: ChatCompletionResponse }> {
  if (!res.ok) {
    throw new Error(`${provider} ${res.status}: ${await res.text()}`);
  }

  const raw = (await res.json()) as ChatCompletionResponse;
  return {
    text: raw.choices?.[0]?.message?.content?.trim() ?? "",
    raw,
  };
}

async function postChatCompletion(
  url: string | URL,
  provider: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) {
  const send = (payload: Record<string, unknown>) =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

  const first = await send(body);
  if (first.ok) return parseChatResponse(first, provider);

  const errorText = await first.text();
  if (
    first.status === 400 &&
    errorText.includes("max_tokens") &&
    errorText.includes("max_completion_tokens") &&
    "max_tokens" in body
  ) {
    const { max_tokens: maxCompletionTokens, ...rest } = body;
    return parseChatResponse(
      await send({
        ...rest,
        max_completion_tokens: maxCompletionTokens,
      }),
      provider,
    );
  }

  throw new Error(`${provider} ${first.status}: ${errorText}`);
}

function openAIHeaders(config: Record<string, unknown>) {
  const apiKey = String(config.apiKey ?? "").trim();
  if (!apiKey) throw new Error("OpenAI connection is missing an API key.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const organizationId = String(config.organizationId ?? "").trim();
  const projectId = String(config.projectId ?? "").trim();
  if (organizationId) headers["OpenAI-Organization"] = organizationId;
  if (projectId) headers["OpenAI-Project"] = projectId;
  return headers;
}

async function callOpenAI(
  config: Record<string, unknown>,
  nodeConfig: LlmPromptConfig,
  messages: ChatMessage[],
) {
  return postChatCompletion(
    "https://api.openai.com/v1/chat/completions",
    "OpenAI",
    openAIHeaders(config),
    {
      model: nodeConfig.model,
      messages,
      temperature: nodeConfig.temperature,
      max_tokens: nodeConfig.maxTokens,
    },
  );
}

function azureChatCompletionsUrl(
  config: Record<string, unknown>,
  deploymentName: string,
) {
  const endpoint = String(config.endpoint ?? "").trim().replace(/\/+$/, "");
  const configuredApiVersion = String(config.apiVersion ?? "").trim();

  if (!endpoint) throw new Error("Azure connection is missing an endpoint.");
  if (!deploymentName) {
    throw new Error("Azure connection is missing a deployment name.");
  }

  const usesUnifiedV1Endpoint = /\/openai\/v1$/i.test(endpoint);
  const url = new URL(
    usesUnifiedV1Endpoint
      ? `${endpoint}/chat/completions`
      : `${endpoint}/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions`,
  );
  if (!usesUnifiedV1Endpoint) {
    url.searchParams.set(
      "api-version",
      configuredApiVersion || "2025-01-01-preview",
    );
  }
  return { url, usesUnifiedV1Endpoint };
}

async function callAzure(
  config: Record<string, unknown>,
  nodeConfig: LlmPromptConfig,
  messages: ChatMessage[],
) {
  const apiKey = String(config.apiKey ?? "").trim();
  if (!apiKey) throw new Error("Azure connection is missing an API key.");

  const { url, usesUnifiedV1Endpoint } = azureChatCompletionsUrl(
    config,
    nodeConfig.model,
  );
  return postChatCompletion(
    url,
    "Azure",
    {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    {
      ...(usesUnifiedV1Endpoint ? { model: nodeConfig.model } : {}),
      messages,
      temperature: nodeConfig.temperature,
      max_tokens: nodeConfig.maxTokens,
    },
  );
}

export const llmPromptNode: NodeDefinition<LlmPromptConfig> = {
  ...llmPromptMeta,

  async run(ctx) {
    if (!ctx.config.prompt.trim() && ctx.inputs.input === undefined) {
      throw new Error("Add a prompt or connect an input.");
    }

    const connection = await getConnection(ctx.config.connectionId);
    if (!connection) throw new Error("Select an AI connection.");

    const configuredModels = modelOptionsForConnection({
      type: connection.type,
      config: connection.config ?? {},
    });
    if (!configuredModels.some((option) => option.value === ctx.config.model)) {
      throw new Error(
        "Select one of the models configured on the chosen AI connection.",
      );
    }

    const messages = buildMessages(ctx.config, ctx.inputs.input);
    const result =
      connection.type === "openai"
        ? await callOpenAI(connection.config ?? {}, ctx.config, messages)
        : connection.type === "azure-foundry"
          ? await callAzure(connection.config ?? {}, ctx.config, messages)
          : (() => {
              throw new Error(
                `Unsupported AI connection type: ${connection.type}`,
              );
            })();

    return {
      type: "output",
      outputs: {
        text: result.text,
        raw: {
          id: result.raw.id,
          model: result.raw.model,
          usage: result.raw.usage,
        },
      },
    };
  },
};
