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

/** Read a required env var by dynamic name (e.g. a provider's clientIdEnv). */
export function requireEnv(name: string): string {
  return required(name);
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

// --- Supabase Storage (asset library) ---------------------------------------
/**
 * Asset uploads (the design-mode Assets library) are stored in Supabase Storage,
 * separate from render outputs (which stay on Vercel Blob). These accessors are
 * non-throwing so importing the storage module never fails at load time — only
 * the asset code path throws when a var is missing.
 */
export const supabaseUrl = () => process.env.SUPABASE_URL?.trim() || undefined;
/** Service-role key — server-only, never exposed to the client. */
export const supabaseServiceRoleKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
/** Storage bucket holding uploaded assets. Defaults to "assets". */
export const supabaseAssetsBucket = () =>
  process.env.SUPABASE_ASSETS_BUCKET?.trim() || "assets";

/** True when both Supabase Storage credentials are present. */
export function hasSupabaseStorage(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceRoleKey());
}

// --- Background queue (Inngest) ---
/**
 * Inngest event key used by the client to send events. Non-throwing (like
 * `blobToken`) so importing the client at module load never fails — it's absent in
 * local dev (the dev server needs no key). The serve endpoint's signing key
 * (`INNGEST_SIGNING_KEY`) is read by the SDK directly, so it needs no accessor here.
 */
export const inngestEventKey = () => process.env.INNGEST_EVENT_KEY;

// --- Workflow node APIs ---
/** OpenAI API key — used by the Rank Images node (GPT vision). */
export const openaiApiKey = () => required("OPENAI_API_KEY");
