import { z } from "zod";
import type { ConnectionDefinition } from "@/lib/connections/types";

/**
 * Google Drive connected account. OAuth 2.0 grant — the canonical OAuth provider.
 * The connect flow stores the token bundle in the connection's config; action
 * nodes call ensureFreshToken() (lib/connections/oauth) before using it.
 */
const configSchema = z
  .object({
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    /** Epoch ms when the access token expires. */
    expires_at: z.number().optional(),
    scope: z.string().optional(),
    token_type: z.string().optional(),
  })
  .passthrough();

type GoogleDriveConfig = z.infer<typeof configSchema>;

export const googleDriveConnection: ConnectionDefinition<GoogleDriveConfig> = {
  id: "google-drive",
  name: "Google Drive",
  description: "Connect Google Drive with OAuth to read files and folders.",
  auth: {
    type: "oauth",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    // Request a refresh token and force the consent screen so we always get one.
    authorizeParams: { access_type: "offline", prompt: "consent" },
  },
  configSchema,
};
