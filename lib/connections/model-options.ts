export const AI_MODEL_CONNECTION_TYPES = ["openai", "azure-foundry"] as const;

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

export function modelOptionsForConnection(input: {
  type: string;
  config: Record<string, unknown>;
}): ConnectionModelOption[] {
  if (input.type === "openai") {
    return splitConfiguredModels(input.config.models).map((model) => ({
      value: model,
      label: model,
    }));
  }

  if (input.type === "azure-foundry") {
    const deploymentName = String(input.config.deploymentName ?? "").trim();
    return deploymentName
      ? [{ value: deploymentName, label: `${deploymentName} (deployment)` }]
      : [];
  }

  return [];
}
