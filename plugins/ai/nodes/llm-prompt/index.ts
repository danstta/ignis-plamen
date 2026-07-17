import { getConnection } from "@/lib/connections/service";
import { modelOptionsForConnection } from "@/lib/connections/model-options";
import type { NodeDefinition } from "@/lib/nodes/types";
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

type AnthropicMessageResponse = {
  content?: { type?: string; text?: string }[];
  usage?: unknown;
  id?: string;
  model?: string;
};

type ChatResult = {
  text: string;
  raw: {
    id?: string;
    model?: string;
    usage?: unknown;
  };
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
): Promise<ChatResult> {
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

function anthropicHeaders(config: Record<string, unknown>) {
  const apiKey = String(config.apiKey ?? "").trim();
  if (!apiKey) throw new Error("Claude connection is missing an API key.");

  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
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

function anthropicMessages(messages: ChatMessage[]) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const userMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => ({ role: "user" as const, content: message.content }));

  return { system, messages: userMessages };
}

async function callAnthropic(
  config: Record<string, unknown>,
  nodeConfig: LlmPromptConfig,
  messages: ChatMessage[],
): Promise<ChatResult> {
  const anthropicPayload = anthropicMessages(messages);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: anthropicHeaders(config),
    body: JSON.stringify({
      model: nodeConfig.model,
      messages: anthropicPayload.messages,
      ...(anthropicPayload.system
        ? { system: anthropicPayload.system }
        : {}),
      temperature: nodeConfig.temperature,
      max_tokens: nodeConfig.maxTokens,
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude ${res.status}: ${await res.text()}`);
  }

  const raw = (await res.json()) as AnthropicMessageResponse;
  return {
    text:
      raw.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text?.trim() ?? "")
        .filter(Boolean)
        .join("\n\n") ?? "",
    raw: {
      id: raw.id,
      model: raw.model,
      usage: raw.usage,
    },
  };
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

    await ctx.log(`Using ${connection.type} model "${ctx.config.model}".`);
    const messages = buildMessages(ctx.config, ctx.inputs.input);
    await ctx.log(
      `Prepared ${messages.length} message${messages.length === 1 ? "" : "s"} for the chat completion request.`,
    );
    await ctx.log("Sending chat completion request.");
    const result =
      connection.type === "openai"
        ? await callOpenAI(connection.config ?? {}, ctx.config, messages)
        : connection.type === "azure-foundry"
          ? await callAzure(connection.config ?? {}, ctx.config, messages)
          : connection.type === "anthropic"
            ? await callAnthropic(connection.config ?? {}, ctx.config, messages)
          : (() => {
              throw new Error(
                `Unsupported AI connection type: ${connection.type}`,
              );
            })();

    await ctx.log(
      `Received response${result.raw.usage ? ` with usage ${JSON.stringify(result.raw.usage)}` : ""}.`,
    );
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
