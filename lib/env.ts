/**
 * Centralized, lazy env access. Values are read at call time (not import time) so
 * `next build` never fails on a missing var — only the code path that needs it does.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return v;
}

export const databaseUrl = () => required("DATABASE_URL");

export const adminPassword = () => required("ADMIN_PASSWORD");

/** Cookie signing secret. Falls back to a dev-only constant outside production. */
export function sessionSecret(): string {
  const v = process.env.SESSION_SECRET;
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production. See .env.example.");
  }
  return "dev-only-insecure-secret-change-me";
}

/**
 * Public, externally-reachable base URL of this app (no trailing slash), e.g.
 * `https://app.example.com` or a tunnel host like `https://abc.trycloudflare.com`.
 * Used to build webhook URLs that third parties (Notion) must reach. When unset,
 * callers fall back to the incoming request host (fine for local browser use, but
 * not reachable by external services).
 */
export function publicAppUrl(): string | undefined {
  const v = process.env.PUBLIC_APP_URL?.trim();
  if (!v) return undefined;
  return v.replace(/\/+$/, "");
}

export const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN;
export const notionWebhookSecret = () => process.env.NOTION_WEBHOOK_SECRET;
export const notionApiToken = () => process.env.NOTION_API_TOKEN;

// --- Workflow node APIs ---
/** OpenAI API key — used by the Rank Images node (GPT vision). */
export const openaiApiKey = () => required("OPENAI_API_KEY");
/** Google Maps Platform key — used by the Find Location Images node (Places API). */
export const googleMapsApiKey = () => required("GOOGLE_MAPS_API_KEY");
