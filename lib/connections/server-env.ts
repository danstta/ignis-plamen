import { getConnectionType } from "@/lib/connections/registry";

type EnvRequirement = {
  name: string;
  required?: boolean;
};

export type ServerEnvironmentConnection = {
  id: string;
  name: string;
  providerType?: string;
  description: string;
  access: string;
  env: EnvRequirement[];
  configured: boolean;
  present: string[];
  missing: string[];
};

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

type ServerEnvironmentConnectionInput = Omit<
  ServerEnvironmentConnection,
  "configured" | "missing" | "present"
>;

function connection(input: ServerEnvironmentConnectionInput) {
  const required = input.env.filter((env) => env.required !== false);
  const present = input.env.filter((env) => hasEnv(env.name)).map((env) => env.name);
  const missing = required.filter((env) => !hasEnv(env.name)).map((env) => env.name);

  return {
    ...input,
    configured: missing.length === 0 && present.length > 0,
    present,
    missing,
  };
}

export function listServerEnvironmentConnections(): ServerEnvironmentConnection[] {
  const googleDrive = getConnectionType("google-drive");

  return [
    connection({
      id: "google-drive-env",
      name: "Google Drive",
      providerType: "google-drive",
      description: "Fixed OAuth account stored on the server.",
      access:
        "Drive OAuth scope: read, create, edit, and delete files available to the authorized account.",
      env: [
        {
          name:
            googleDrive?.auth.type === "oauth"
              ? googleDrive.auth.clientIdEnv
              : "GOOGLE_CLIENT_ID",
        },
        {
          name:
            googleDrive?.auth.type === "oauth"
              ? googleDrive.auth.clientSecretEnv
              : "GOOGLE_CLIENT_SECRET",
        },
        {
          name:
            googleDrive?.auth.type === "oauth"
              ? (googleDrive.auth.refreshTokenEnv ?? "GOOGLE_DRIVE_REFRESH_TOKEN")
              : "GOOGLE_DRIVE_REFRESH_TOKEN",
        },
      ],
    }),
    connection({
      id: "openai-env",
      name: "OpenAI",
      providerType: "openai",
      description: "Server API key used by workflow nodes.",
      access:
        "Model calls, generation, vision, and image ranking through the configured API key.",
      env: [{ name: "OPENAI_API_KEY" }],
    }),
    connection({
      id: "pexels-env",
      name: "Pexels",
      description: "Optional stock image provider for location image search.",
      access: "Searches Pexels photos and reads image metadata for workflow results.",
      env: [{ name: "PEXELS_API_KEY" }],
    }),
    connection({
      id: "supabase-env",
      name: "Supabase Storage",
      providerType: "supabase",
      description: "Asset library storage backend.",
      access:
        "Service-role storage access for uploaded assets in the configured bucket; server-only.",
      env: [
        { name: "SUPABASE_URL" },
        { name: "SUPABASE_SERVICE_ROLE_KEY" },
        { name: "SUPABASE_ASSETS_BUCKET", required: false },
      ],
    }),
    connection({
      id: "vercel-blob-env",
      name: "Vercel Blob",
      providerType: "vercel",
      description: "Render and export output storage.",
      access: "Read/write access for generated files and render artifacts stored in Blob.",
      env: [{ name: "BLOB_READ_WRITE_TOKEN" }],
    }),
  ];
}
