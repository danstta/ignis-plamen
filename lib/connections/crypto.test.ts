import { afterEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { isSealedConfig, openConfig, sealConfig } from "./crypto";

/**
 * Tests for the connection-credential envelope encryption. The key is read at
 * call time, so each test sets/unsets CONNECTIONS_ENCRYPTION_KEY directly and
 * afterEach restores the original value. All fixtures are obviously fake —
 * never put real credential values here.
 */

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");
const originalKey = process.env.CONNECTIONS_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  } else {
    process.env.CONNECTIONS_ENCRYPTION_KEY = originalKey;
  }
});

const config = {
  accessToken: "test-token-value",
  refreshToken: "test-refresh-value",
  nested: { deep: { flag: true, count: 3 } },
  unicode: "ćžšđ — 日本語 ✓",
  list: ["a", "b"],
};

describe("sealConfig / openConfig roundtrip", () => {
  test("seal then open returns a deep-equal config", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY = KEY;
    const sealed = sealConfig(config);
    expect(isSealedConfig(sealed)).toBe(true);
    expect(sealed).not.toEqual(config);
    expect(openConfig(sealed)).toEqual(config);
  });

  test("sealed data does not contain plaintext values", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY = KEY;
    const sealed = sealConfig(config);
    expect(JSON.stringify(sealed)).not.toContain("test-token-value");
  });
});

describe("no key configured", () => {
  test("seal is a passthrough returning the exact plaintext object", () => {
    delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    expect(sealConfig(config)).toBe(config);
  });

  test("open of plaintext is a passthrough", () => {
    delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    expect(openConfig(config)).toBe(config);
  });

  test("open of a sealed envelope without the key throws naming the var", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY = KEY;
    const sealed = sealConfig(config);
    delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    expect(() => openConfig(sealed)).toThrow(/CONNECTIONS_ENCRYPTION_KEY/);
  });
});

describe("key and integrity failures", () => {
  test("open with a wrong key throws (GCM auth failure)", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY = KEY;
    const sealed = sealConfig(config);
    process.env.CONNECTIONS_ENCRYPTION_KEY = OTHER_KEY;
    expect(() => openConfig(sealed)).toThrow(/decrypt/i);
  });

  test("tampered data throws", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY = KEY;
    const sealed = sealConfig(config) as { __ignis_enc: "v1"; data: string };
    const flipped =
      (sealed.data[10] === "A" ? "B" : "A") +
      sealed.data.slice(1, 10) +
      sealed.data[0] +
      sealed.data.slice(11);
    expect(() => openConfig({ ...sealed, data: flipped })).toThrow();
  });

  test("malformed key (not 32 bytes after decode) throws a clear message", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY =
      Buffer.from("short-key").toString("base64");
    expect(() => sealConfig(config)).toThrow(/32 random bytes/);
  });
});

describe("isSealedConfig", () => {
  test("true for a sealed envelope", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY = KEY;
    expect(isSealedConfig(sealConfig(config))).toBe(true);
  });

  test("false for plaintext configs, including ones with a data key", () => {
    expect(isSealedConfig(config)).toBe(false);
    expect(isSealedConfig({ data: "just-a-field" })).toBe(false);
    expect(isSealedConfig({ __ignis_enc: "v2", data: "x" })).toBe(false);
    expect(isSealedConfig(null)).toBe(false);
    expect(isSealedConfig("string")).toBe(false);
  });
});
