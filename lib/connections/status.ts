import { getConnectionType } from "./registry";

export type ConnectionSetupState =
  | {
      configured: true;
      missingLabels: [];
    }
  | {
      configured: false;
      missingLabels: string[];
    };

export function getConnectionSetupState(
  type: string,
  config: Record<string, unknown>,
): ConnectionSetupState {
  const def = getConnectionType(type);
  if (!def) return { configured: false, missingLabels: ["provider"] };

  if (def.auth.type === "oauth") {
    return config.access_token
      ? { configured: true, missingLabels: [] }
      : { configured: false, missingLabels: ["authorization"] };
  }

  const requiredFields = def.auth.fields.filter((field) => field.required !== false);
  const missingLabels = requiredFields
    .filter((field) => !String(config[field.name] ?? "").trim())
    .map((field) => field.label);

  return missingLabels.length === 0
    ? { configured: true, missingLabels: [] }
    : { configured: false, missingLabels };
}
