/**
 * Shared hardening helpers for the public webhook ingest routes
 * (/api/hooks and /api/link-hub/notion): header redaction before payloads are
 * persisted or forwarded into runs, and size-capped body reads.
 */

/**
 * Headers whose values must never be persisted or forwarded into run payloads.
 * Deliberately does NOT match x-idempotency-key / x-github-delivery /
 * x-request-id — run dedupe depends on them and they carry no secret material.
 */
const SENSITIVE_HEADER =
  /(^authorization$|^proxy-authorization$|^cookie$|^set-cookie$|^x-api-key$|token|secret|signature|password)/i;

export const WEBHOOK_MAX_BODY_BYTES = 1024 * 1024; // 1 MiB — generous for JSON webhooks

/** Copy headers, replacing sensitive values with "[redacted]". Keys are lowercased by the Headers iterator already. */
export function sanitizeWebhookHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = SENSITIVE_HEADER.test(key) ? "[redacted]" : value;
  });
  return out;
}

/**
 * Read a request body up to `maxBytes`. Checks Content-Length first when
 * present, then enforces the cap while streaming, so an oversized body is
 * rejected without being fully buffered.
 * Returns { ok: true, bytes } or { ok: false } (caller responds 413).
 */
export async function readBodyWithLimit(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; bytes: Buffer } | { ok: false }> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };

  const reader = req.body?.getReader();
  if (!reader) return { ok: true, bytes: Buffer.alloc(0) };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // Content-Length can lie (or be absent for chunked bodies) — the streamed
      // total is what actually bounds memory.
      if (total > maxBytes) return { ok: false };
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}
