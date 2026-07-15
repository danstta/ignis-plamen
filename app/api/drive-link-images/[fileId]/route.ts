import { NextResponse } from "next/server";
import { isImageContentType } from "@/lib/images/content-types";
import { normalizeImageForPreview } from "@/lib/images/normalize";

export const runtime = "nodejs";

const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/** Upstream responses above this are rejected instead of buffered for HEIC conversion. */
const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024; // 10 MiB

function driveDirectLink(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

/**
 * Read the upstream body up to `maxBytes`, bailing out mid-stream so an
 * oversized file is never fully buffered. Local to this route: drive-images
 * streams through a different path and webhook-ingest is webhook-scoped.
 */
async function readResponseWithLimit(
  res: Response,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };

  const reader = res.body?.getReader();
  if (!reader) return { ok: true, bytes: new Uint8Array(0) };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) return { ok: false };
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  if (!DRIVE_FILE_ID.test(fileId)) {
    return NextResponse.json({ error: "Invalid Drive file ID." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(driveDirectLink(fileId), {
      headers: { Accept: "image/*" },
      signal: controller.signal,
    });

    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText);
      return NextResponse.json(
        { error: `Google Drive image fetch failed (${res.status}): ${message}` },
        { status: 502 },
      );
    }

    const upstreamContentType =
      res.headers.get("content-type") ?? "application/octet-stream";
    const read = await readResponseWithLimit(res, MAX_UPSTREAM_BYTES);
    if (!read.ok) {
      return NextResponse.json(
        {
          error: `Google Drive file exceeds the ${MAX_UPSTREAM_BYTES / (1024 * 1024)} MiB preview limit.`,
        },
        { status: 502 },
      );
    }
    const preview = await normalizeImageForPreview({
      bytes: read.bytes,
      contentType: upstreamContentType,
    });

    if (!isImageContentType(preview.contentType)) {
      return NextResponse.json(
        {
          error: `Google Drive returned ${upstreamContentType}, not a recognized image.`,
        },
        { status: 502 },
      );
    }

    return new Response(new Uint8Array(preview.bytes), {
      headers: {
        "Content-Type": preview.contentType,
        "Cache-Control": "private, max-age=300",
        ...(preview.converted ? { "X-Ignis-Image-Converted": "heic-to-jpeg" } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
