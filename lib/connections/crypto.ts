import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { connectionsEncryptionKey } from "@/lib/env";

/**
 * Envelope encryption for connection credentials. The whole config object is
 * sealed into `{ __ignis_enc: "v1", data }` where `data` = base64(iv ‖ ciphertext ‖ tag).
 * Key: CONNECTIONS_ENCRYPTION_KEY, 32 random bytes base64-encoded. When the key
 * is unset, seal passes plaintext through unchanged and open returns plaintext
 * rows as-is (self-hosted minimal setups keep working; README documents the
 * tradeoff). Opening a sealed row without the right key throws — that is an
 * operator error that must surface loudly, never fail-soft to ciphertext.
 */

const ENVELOPE_MARKER = "__ignis_enc" as const;
const ENVELOPE_VERSION = "v1" as const;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export type SealedConfig = { __ignis_enc: "v1"; data: string };

export function isSealedConfig(value: unknown): value is SealedConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>)[ENVELOPE_MARKER] === ENVELOPE_VERSION &&
    typeof (value as Record<string, unknown>).data === "string"
  );
}

/** Decode and validate the key, or undefined when encryption is not configured. */
function loadKey(): Buffer | undefined {
  const raw = connectionsEncryptionKey();
  if (!raw) return undefined;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "CONNECTIONS_ENCRYPTION_KEY must be 32 random bytes base64-encoded " +
        `(got ${key.length} bytes after decoding). See .env.example.`,
    );
  }
  return key;
}

/**
 * Encrypt a config object into a sealed envelope. Passthrough (returns the
 * exact input) when CONNECTIONS_ENCRYPTION_KEY is unset.
 */
export function sealConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const key = loadKey();
  if (!key) return config;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  const data = Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString(
    "base64",
  );
  const sealed: SealedConfig = { [ENVELOPE_MARKER]: ENVELOPE_VERSION, data };
  return sealed;
}

/**
 * Decrypt a stored config. Plaintext (legacy, pre-encryption) rows pass through
 * unchanged; sealed rows require the key and a valid auth tag or this throws.
 */
export function openConfig(
  stored: Record<string, unknown>,
): Record<string, unknown> {
  if (!isSealedConfig(stored)) return stored;
  const key = loadKey();
  if (!key) {
    throw new Error(
      "Connection config is encrypted but CONNECTIONS_ENCRYPTION_KEY is not set. " +
        "Set the key this row was sealed with to read it.",
    );
  }
  const buf = Buffer.from(stored.data, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error(
      "Encrypted connection config is corrupt: sealed payload is too short.",
    );
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error(
      "Failed to decrypt connection config: wrong CONNECTIONS_ENCRYPTION_KEY " +
        "or corrupted data.",
    );
  }
  return JSON.parse(plaintext.toString("utf8"));
}
