/**
 * Read an upstream response body up to `maxBytes`, bailing out mid-stream so an
 * oversized file is never fully buffered. On overflow the stream is cancelled
 * instead of abandoned — an unread upstream body keeps pulling bandwidth and
 * holds a connection-pool slot until GC.
 */
export async function readResponseWithLimit(
  res: Response,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    return { ok: false };
  }

  const reader = res.body?.getReader();
  if (!reader) return { ok: true, bytes: new Uint8Array(0) };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}
