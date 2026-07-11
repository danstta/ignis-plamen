export const AI_MODEL_CONNECTION_TYPES = [
  "openai",
  "azure-foundry",
  "anthropic",
] as const;

export type AIModelConnectionType = (typeof AI_MODEL_CONNECTION_TYPES)[number];

export type ConnectionModelOption = {
  value: string;
  label: string;
};

export type ModelConnectionOption = {
  id: string;
  name: string;
  type: AIModelConnectionType;
  models: ConnectionModelOption[];
};

export function isAIModelConnectionType(
  type: string,
): type is AIModelConnectionType {
  return AI_MODEL_CONNECTION_TYPES.includes(type as AIModelConnectionType);
}

export function splitConfiguredModels(value: unknown): string[] {
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.join("\n")
        : "";

  return [
    ...new Set(
      raw
        .split(/[\n,]/)
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ];
}

function configuredModelOptions(
  value: unknown,
  labelSuffix = "",
): ConnectionModelOption[] {
  return splitConfiguredModels(value).map((model) => ({
    value: model,
    label: labelSuffix ? `${model} ${labelSuffix}` : model,
  }));
}

export function modelOptionsForConnection(input: {
  type: string;
  config: Record<string, unknown>;
}): ConnectionModelOption[] {
  if (input.type === "openai" || input.type === "anthropic") {
    return configuredModelOptions(input.config.models);
  }

  if (input.type === "azure-foundry") {
    return configuredModelOptions(input.config.deploymentName, "(deployment)");
  }

  return [];
}
