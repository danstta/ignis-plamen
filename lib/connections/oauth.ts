import { sessionSecret, requireEnv, publicAppUrl } from "@/lib/env";
import { getConnectionType } from "./registry";
import { getConnection, mergeConnectionConfig } from "./service";
import type { ConnectionDefinition } from "./types";

/**
 * OAuth 2.0 plumbing shared by the connect routes (start/callback) and action
 * nodes. State is an HMAC-signed token (Web Crypto) so the callback can trust the
 * provider + optional reconnect target without server-side session storage.
 */

export type OAuthDef = Extract<ConnectionDefinition["auth"], { type: "oauth" }>;

export type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

export type OAuthState = { provider: string; connectionId?: string };

export function getMissingOAuthEnv(auth: OAuthDef): string[] {
  return [auth.clientIdEnv, auth.clientSecretEnv].filter(
    (name) => !process.env[name]?.trim(),
  );
}

export function getOAuthEnvRefreshToken(auth: OAuthDef): string | undefined {
  const name = auth.refreshTokenEnv;
  if (!name) return undefined;
  return process.env[name]?.trim() || undefined;
}

/** Sign a short-lived (10 min) state token for the authorize redirect. */
export async function signState(state: OAuthState): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ ...state, exp: Date.now() + 600_000 })),
  );
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyState(token: string): Promise<OAuthState | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(payload))) return null;
  try {
    const data = JSON.parse(decoder.decode(fromBase64Url(payload)));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { provider: data.provider, connectionId: data.connectionId };
  } catch {
    return null;
  }
}

/** The redirect URI for a provider — must match the OAuth client registration. */
export function redirectUri(provider: string, req: Request): string {
  let base = publicAppUrl();
  if (!base) {
    const url = new URL(req.url);
    base = `${url.protocol}//${url.host}`;
  }
  return `${base}/api/connections/oauth/${provider}/callback`;
}

export function buildAuthorizeUrl(
  auth: OAuthDef,
  provider: string,
  redirect: string,
  state: string,
): string {
  const url = new URL(auth.authorizeUrl);
  url.searchParams.set("client_id", requireEnv(auth.clientIdEnv));
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", auth.scopes.join(" "));
  url.searchParams.set("state", state);
  for (const [k, v] of Object.entries(auth.authorizeParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

function toTokens(raw: Record<string, unknown>): OAuthTokens {
  const expiresIn = Number(raw.expires_in);
  return {
    access_token: String(raw.access_token ?? ""),
    refresh_token: raw.refresh_token ? String(raw.refresh_token) : undefined,
    expires_at: Number.isFinite(expiresIn)
      ? Date.now() + expiresIn * 1000
      : undefined,
    scope: raw.scope ? String(raw.scope) : undefined,
    token_type: raw.token_type ? String(raw.token_type) : undefined,
  };
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForToken(
  auth: OAuthDef,
  code: string,
  redirect: string,
): Promise<OAuthTokens> {
  const res = await fetch(auth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: requireEnv(auth.clientIdEnv),
      client_secret: requireEnv(auth.clientSecretEnv),
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  return toTokens(await res.json());
}

/**
 * Return a valid access token for an OAuth connection, refreshing it in place if
 * it's expired (or about to). Action nodes call this before using the account.
 */
export async function ensureFreshToken(connectionId: string): Promise<string> {
  const conn = await getConnection(connectionId);
  if (!conn) throw new Error("Connection not found");
  const def = getConnectionType(conn.type);
  if (!def || def.auth.type !== "oauth") {
    throw new Error(`Connection "${conn.type}" is not an OAuth provider`);
  }
  const config = conn.config as OAuthTokens;
  const stillFresh =
    config.access_token &&
    config.expires_at &&
    config.expires_at - 60_000 > Date.now();
  if (stillFresh) return config.access_token;

  const storedRefreshToken = config.refresh_token;
  const envRefreshToken = getOAuthEnvRefreshToken(def.auth);
  const refreshToken = storedRefreshToken ?? envRefreshToken;

  if (!refreshToken) {
    if (config.access_token) return config.access_token; // no refresh available
    throw new Error("Connection has no access token; reconnect required");
  }

  const res = await fetch(def.auth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: requireEnv(def.auth.clientIdEnv),
      client_secret: requireEnv(def.auth.clientSecretEnv),
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }
  const next = toTokens(await res.json());
  const patch: Record<string, unknown> = { ...next };
  // Google omits refresh_token on refresh. Keep stored tokens in DB, but do not
  // copy fixed-account env secrets into connection config.
  const nextRefreshToken = next.refresh_token ?? storedRefreshToken;
  if (nextRefreshToken) patch.refresh_token = nextRefreshToken;
  else delete patch.refresh_token;
  await mergeConnectionConfig(connectionId, patch);
  return next.access_token;
}
