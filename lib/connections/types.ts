import type { ZodType } from "zod";

/**
 * A connection *provider* (Pipedream-style "app"). Adding an integration = define
 * one of these and register it in `registry.ts`. A provider declares how accounts
 * authenticate — by key/token entry or by an OAuth 2.0 grant — and the Settings
 * UI + OAuth routes are driven generically off it. Triggering and field reading
 * are NOT provider concerns anymore: triggers are Webhook nodes, and action nodes
 * load a connection's credentials at run time.
 */

/** A credential input the key-based config form renders (secrets use "password"). */
export interface ConfigField {
  name: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  help?: string;
  required?: boolean;
}

/** How a provider's accounts authenticate. */
export type ConnectionAuth =
  | {
      type: "keys";
      /** Fields the user fills in manually (API keys, tokens, ids). */
      fields: ConfigField[];
    }
  | {
      type: "oauth";
      authorizeUrl: string;
      tokenUrl: string;
      scopes: string[];
      /** Env var names holding the OAuth client credentials. */
      clientIdEnv: string;
      clientSecretEnv: string;
      /** Extra static params appended to the authorize URL (e.g. access_type=offline). */
      authorizeParams?: Record<string, string>;
    };

export interface ConnectionDefinition<
  Config extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Stable provider id stored on connection instances, e.g. "notion". */
  id: string;
  name: string;
  description: string;
  auth: ConnectionAuth;
  /** Validates/normalizes stored credentials (keys, or OAuth token bundle). */
  configSchema: ZodType<Config>;
}
