import { describe, expect, test } from "bun:test";
import {
  WEBHOOK_MAX_BODY_BYTES,
  readBodyWithLimit,
  sanitizeWebhookHeaders,
} from "./webhook-ingest";

describe("sanitizeWebhookHeaders", () => {
  test("redacts credential and signature headers", () => {
    const sanitized = sanitizeWebhookHeaders(
      new Headers({
        authorization: "Bearer live-secret",
        cookie: "session=abc",
        "x-notion-signature": "sha256=deadbeef",
        "x-webhook-token": "tok_123",
        "x-hub-signature-256": "sha256=cafe",
        "x-api-key": "key_456",
        "x-client-secret": "shh",
        "x-admin-password": "hunter2",
      }),
    );
    for (const value of Object.values(sanitized)) {
      expect(value).toBe("[redacted]");
    }
  });

  test("preserves operational headers, including the dedupe trio", () => {
    const sanitized = sanitizeWebhookHeaders(
      new Headers({
        "content-type": "application/json",
        "x-idempotency-key": "idem-1",
        "x-github-delivery": "gh-2",
        "x-request-id": "req-3",
        "user-agent": "GitHub-Hookshot/abc",
      }),
    );
    expect(sanitized).toEqual({
      "content-type": "application/json",
      "x-idempotency-key": "idem-1",
      "x-github-delivery": "gh-2",
      "x-request-id": "req-3",
      "user-agent": "GitHub-Hookshot/abc",
    });
  });

  test("matches case-insensitively (Headers lowercases, but don't rely on it)", () => {
    const sanitized = sanitizeWebhookHeaders(
      new Headers({ AUTHORIZATION: "Bearer x" }),
    );
    expect(sanitized["authorization"]).toBe("[redacted]");
  });
});

describe("readBodyWithLimit", () => {
  const request = (body: BodyInit | null, headers?: Record<string, string>) =>
    new Request("http://localhost/hook", { method: "POST", body, headers });

  test("returns the bytes when under the cap", async () => {
    const result = await readBodyWithLimit(request("hello"), 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.toString("utf8")).toBe("hello");
  });

  test("accepts a body exactly at the cap", async () => {
    const result = await readBodyWithLimit(request("12345"), 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.byteLength).toBe(5);
  });

  test("rejects a body one byte over the cap", async () => {
    const result = await readBodyWithLimit(request("123456"), 5);
    expect(result.ok).toBe(false);
  });

  test("rejects early on an oversized Content-Length without reading", async () => {
    const req = request("tiny", {
      "content-length": String(WEBHOOK_MAX_BODY_BYTES + 1),
    });
    const result = await readBodyWithLimit(req, WEBHOOK_MAX_BODY_BYTES);
    expect(result.ok).toBe(false);
  });

  test("enforces the streamed cap when Content-Length understates the body", async () => {
    // A hand-built stream bypasses fetch's automatic Content-Length, modeling
    // a sender that lies (declares 3 bytes, streams far more).
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("a".repeat(64)));
        controller.close();
      },
    });
    const req = new Request("http://localhost/hook", {
      method: "POST",
      body: stream,
      headers: { "content-length": "3" },
      // @ts-expect-error -- duplex is required for streaming bodies but missing from the type
      duplex: "half",
    });
    const result = await readBodyWithLimit(req, 16);
    expect(result.ok).toBe(false);
  });

  test("a missing body yields empty bytes", async () => {
    const result = await readBodyWithLimit(request(null), 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.byteLength).toBe(0);
  });
});
